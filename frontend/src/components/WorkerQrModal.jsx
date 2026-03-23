import React from 'react';
import WorkerQrCard from './WorkerQrCard';

export default function WorkerQrModal({ open, worker, onClose }) {
  if (!open || !worker) {
    return null;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal worker-qr-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Worker QR Code</span>
          <button className="modal-close" onClick={onClose} aria-label="Close worker QR code">×</button>
        </div>

        <WorkerQrCard worker={worker} autoRefresh />

        <div className="worker-qr-actions worker-qr-actions-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}