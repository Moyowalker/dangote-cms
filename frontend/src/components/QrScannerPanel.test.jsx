import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import QrScannerPanel from './QrScannerPanel';

describe('QrScannerPanel', () => {
  const originalBarcodeDetector = window.BarcodeDetector;
  const originalMediaDevices = navigator.mediaDevices;
  const originalPlay = HTMLMediaElement.prototype.play;
  const originalPause = HTMLMediaElement.prototype.pause;
  const originalReadyState = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'readyState');
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