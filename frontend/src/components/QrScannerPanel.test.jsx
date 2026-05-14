import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import QrScannerPanel from './QrScannerPanel';
import jsQR from 'jsqr';

vi.mock('jsqr', () => ({
  default: vi.fn()
}));

describe('QrScannerPanel', () => {
  const originalBarcodeDetector = window.BarcodeDetector;
  const originalMediaDevices = navigator.mediaDevices;
  const originalPlay = HTMLMediaElement.prototype.play;
  const originalPause = HTMLMediaElement.prototype.pause;
  const originalReadyState = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'readyState');
  const originalVideoWidth = Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, 'videoWidth');
  const originalVideoHeight = Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, 'videoHeight');
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  const originalRequestAnimationFrame = window.requestAnimationFrame;
  const originalCancelAnimationFrame = window.cancelAnimationFrame;

  beforeEach(() => {
    vi.clearAllMocks();
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue();
    HTMLMediaElement.prototype.pause = vi.fn();
    Object.defineProperty(HTMLMediaElement.prototype, 'readyState', {
      configurable: true,
      get: () => 4
    });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', {
      configurable: true,
      get: () => 320
    });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', {
      configurable: true,
      get: () => 320
    });
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({
        data: new Uint8ClampedArray(320 * 320 * 4),
        width: 320,
        height: 320
      }))
    }));
    window.requestAnimationFrame = vi.fn((callback) => setTimeout(() => callback(performance.now()), 0));
    window.cancelAnimationFrame = vi.fn((handle) => clearTimeout(handle));
  });

  afterEach(() => {
    if (originalBarcodeDetector) {
      window.BarcodeDetector = originalBarcodeDetector;
    } else {
      delete window.BarcodeDetector;
    }

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: originalMediaDevices
    });
    HTMLMediaElement.prototype.play = originalPlay;
    HTMLMediaElement.prototype.pause = originalPause;
    if (originalReadyState) {
      Object.defineProperty(HTMLMediaElement.prototype, 'readyState', originalReadyState);
    } else {
      delete HTMLMediaElement.prototype.readyState;
    }
    if (originalVideoWidth) {
      Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', originalVideoWidth);
    } else {
      delete HTMLVideoElement.prototype.videoWidth;
    }
    if (originalVideoHeight) {
      Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', originalVideoHeight);
    } else {
      delete HTMLVideoElement.prototype.videoHeight;
    }
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
  });

  it('shows a fallback message when camera scanning is unsupported', async () => {
    delete window.BarcodeDetector;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: undefined
    });

    render(<QrScannerPanel open onClose={vi.fn()} onDetected={vi.fn()} />);

    expect(await screen.findByText(/camera unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/use qr token paste or badge lookup/i)).toBeInTheDocument();
  });

  it('falls back to jsqr when BarcodeDetector is unavailable', async () => {
    const stopTrack = vi.fn();
    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: stopTrack }]
    });

    delete window.BarcodeDetector;
    jsQR.mockReturnValueOnce(null).mockReturnValueOnce({ data: 'fallback-camera-token' });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia }
    });

    const onDetected = vi.fn();
    render(<QrScannerPanel open onClose={vi.fn()} onDetected={onDetected} />);

    await waitFor(() => {
      expect(onDetected).toHaveBeenCalledWith('fallback-camera-token');
    });

    expect(getUserMedia).toHaveBeenCalled();
    expect(jsQR).toHaveBeenCalled();
    expect(stopTrack).toHaveBeenCalled();
  });

  it('shows a permission-specific message when camera access is denied', async () => {
    const getUserMedia = vi.fn().mockRejectedValue(Object.assign(new Error('Permission denied'), {
      name: 'NotAllowedError'
    }));

    delete window.BarcodeDetector;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia }
    });

    render(<QrScannerPanel open onClose={vi.fn()} onDetected={vi.fn()} />);

    expect(await screen.findByText(/camera access was blocked/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry camera/i })).toBeInTheDocument();
  });

  it('detects a QR code from the camera stream and returns the token', async () => {
    const stopTrack = vi.fn();
    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: stopTrack }]
    });
    const detect = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ rawValue: 'signed-camera-token' }]);

    window.BarcodeDetector = class MockBarcodeDetector {
      constructor() {
        this.detect = detect;
      }
    };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia }
    });

    const onDetected = vi.fn();
    render(<QrScannerPanel open onClose={vi.fn()} onDetected={onDetected} />);

    await waitFor(() => {
      expect(onDetected).toHaveBeenCalledWith('signed-camera-token');
    });

    expect(getUserMedia).toHaveBeenCalled();
    expect(stopTrack).toHaveBeenCalled();
  });
});