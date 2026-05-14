import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

function getBarcodeDetectorClass() {
  return window.BarcodeDetector || null;
}

function isScannerSupported() {
  return Boolean(navigator.mediaDevices?.getUserMedia);
}

function createJsQrDetector() {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });

  if (!context) {
    throw new Error('Camera preview is unavailable. Use QR token paste or badge lookup on this device.');
  }

  return {
    async detect(videoElement) {
      const width = videoElement.videoWidth || videoElement.clientWidth;
      const height = videoElement.videoHeight || videoElement.clientHeight;

      if (!width || !height) {
        return [];
      }

      canvas.width = width;
      canvas.height = height;
      context.drawImage(videoElement, 0, 0, width, height);

      const imageData = context.getImageData(0, 0, width, height);
      const match = jsQR(imageData.data, imageData.width, imageData.height);

      return match?.data ? [{ rawValue: match.data }] : [];
    }
  };
}

function createQrDetector() {
  const BarcodeDetectorClass = getBarcodeDetectorClass();

  if (BarcodeDetectorClass) {
    try {
      return new BarcodeDetectorClass({ formats: ['qr_code'] });
    } catch {
      return createJsQrDetector();
    }
  }

  return createJsQrDetector();
}

function getScannerStartErrorMessage(error) {
  if (!error) {
    return 'Unable to start the camera scanner on this device.';
  }

  switch (error.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera access was blocked. Allow camera permission in Safari settings for this site, then retry.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No camera was found on this device. Use QR token paste or badge lookup instead.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'The camera is busy or unavailable. Close other apps using the camera, then retry.';
    case 'OverconstrainedError':
      return 'This camera mode is not supported on the device. Retry and Safari will use the available camera.';
    default:
      return error.message || 'Unable to start the camera scanner on this device.';
  }
}

export default function QrScannerPanel({ open, onClose, onDetected }) {
  const videoRef = useRef(null);
  const detectorRef = useRef(null);
  const streamRef = useRef(null);
  const frameHandleRef = useRef(null);
  const activeRef = useRef(false);
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    let cancelled = false;

    async function stopScanner() {
      activeRef.current = false;
      if (frameHandleRef.current) {
        window.cancelAnimationFrame(frameHandleRef.current);
        frameHandleRef.current = null;
      }

      const videoElement = videoRef.current;
      if (videoElement) {
        videoElement.pause?.();
        videoElement.srcObject = null;
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    }

    async function scanFrame() {
      if (!activeRef.current || cancelled) {
        return;
      }

      const videoElement = videoRef.current;
      const detector = detectorRef.current;
      if (!videoElement || !detector || videoElement.readyState < 2) {
        frameHandleRef.current = window.requestAnimationFrame(scanFrame);
        return;
      }

      try {
        const detections = await detector.detect(videoElement);
        const match = detections.find((entry) => typeof entry.rawValue === 'string' && entry.rawValue.trim());

        if (match) {
          await stopScanner();
          onDetected(match.rawValue.trim());
          return;
        }
      } catch (error) {
        setStatus('error');
        setMessage(error.message || 'Camera scan failed. Switch to QR token paste if this device is unstable.');
        await stopScanner();
        return;
      }

      frameHandleRef.current = window.requestAnimationFrame(scanFrame);
    }

    async function startScanner() {
      if (!isScannerSupported()) {
        setStatus('unsupported');
        setMessage('This browser cannot read QR codes from the camera. Use QR token paste or badge lookup on this device.');
        return;
      }

      setStatus('starting');
      setMessage('Requesting camera access...');

      try {
        detectorRef.current = createQrDetector();

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' }
          }
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        const videoElement = videoRef.current;
        if (!videoElement) {
          throw new Error('Camera preview is unavailable.');
        }

        videoElement.srcObject = stream;
        await videoElement.play();
        activeRef.current = true;
        setStatus('scanning');
        setMessage('Align the worker QR code inside the frame. Hold the phone steady, avoid glare, and validation will start automatically after detection.');
        frameHandleRef.current = window.requestAnimationFrame(scanFrame);
      } catch (error) {
        setStatus('error');
        setMessage(getScannerStartErrorMessage(error));
        await stopScanner();
      }
    }

    startScanner();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [onDetected, open, retryCount]);

  if (!open) {
    return null;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal scanner-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Scan Worker QR Code</span>
          <button className="modal-close" onClick={onClose} aria-label="Close scanner">×</button>
        </div>
        <div className="scanner-frame">
          <video ref={videoRef} className="scanner-video" playsInline muted />
          {status === 'scanning' && (
            <div className="scanner-guide" aria-hidden="true">
              <div className="scanner-guide-window" />
            </div>
          )}
          {status !== 'scanning' && (
            <div className="scanner-placeholder">
              <strong>{status === 'unsupported' ? 'Camera unavailable' : status === 'error' ? 'Scanner stopped' : 'Starting scanner'}</strong>
            </div>
          )}
        </div>
        {status === 'scanning' && (
          <div className="scanner-tips">
            <span className="badge badge-info">Rear camera preferred</span>
            <span className="badge badge-warning">Avoid screen glare</span>
            <span className="badge badge-secondary">Keep code inside frame</span>
          </div>
        )}
        {message && <div className={`alert ${status === 'error' || status === 'unsupported' ? 'alert-error' : 'alert-info'}`}>{message}</div>}
        <div className="scanner-actions">
          {status === 'error' && (
            <button type="button" className="btn btn-primary" onClick={() => setRetryCount((count) => count + 1)}>Retry Camera</button>
          )}
          <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}