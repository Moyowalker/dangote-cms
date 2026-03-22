import React, { useEffect, useRef, useState } from 'react';

function getBarcodeDetectorClass() {
  return window.BarcodeDetector || null;
}

function isScannerSupported() {
  return Boolean(getBarcodeDetectorClass() && navigator.mediaDevices?.getUserMedia);
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
        const BarcodeDetectorClass = getBarcodeDetectorClass();
        detectorRef.current = new BarcodeDetectorClass({ formats: ['qr_code'] });

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
        setMessage(error.message || 'Unable to start the camera scanner on this device.');
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