import React, { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import client from '../api/client';

const DEFAULT_TTL_SECONDS = 120;
const AUTO_REFRESH_BUFFER_SECONDS = 20;
const MAX_TIMEOUT_MS = 2147483647;

function formatSecondsRemaining(secondsRemaining) {
  if (secondsRemaining <= 0) {
    return 'Expired';
  }

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);
  return copied;
}

function downloadDataUrl(dataUrl, filename) {
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

function printQrCard({ worker, qrCodeUrl, expiresAt }) {
  const printWindow = window.open('', '_blank', 'width=720,height=920');
  if (!printWindow) {
    throw new Error('Pop-up blocked while opening the print window.');
  }

  printWindow.document.write(`
    <html>
      <head>
        <title>Worker QR Code</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 32px; color: #103624; }
          .card { max-width: 480px; margin: 0 auto; border: 2px solid #d9e8dd; border-radius: 18px; padding: 24px; text-align: center; }
          img { width: 320px; height: 320px; display: block; margin: 0 auto 16px; }
          h1 { margin: 0 0 8px; font-size: 24px; }
          p { margin: 6px 0; font-size: 14px; }
          .meta { color: #4d6a57; }
          .warning { margin-top: 16px; padding: 12px; border-radius: 10px; background: #fffbeb; color: #92400e; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>${worker.name}</h1>
          <p>${worker.employee_number} - Badge ${worker.badge_number}</p>
          <img src="${qrCodeUrl}" alt="Worker QR Code" />
          <p class="meta">Issued QR expires at ${new Date(expiresAt).toLocaleTimeString()}</p>
          <div class="warning">This QR code is short-lived and becomes invalid after a successful meal redemption.</div>
        </div>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

export default function WorkerQrCard({
  worker,
  autoRefresh = false,
  showToken = true,
  allowPortableActions = true,
  allowManualRefresh = true
}) {
  const [status, setStatus] = useState('idle');
  const [qrState, setQrState] = useState({ token: '', qrCodeUrl: '', expiresAt: '', ttlSeconds: DEFAULT_TTL_SECONDS });
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('idle');
  const [actionStatus, setActionStatus] = useState('idle');
  const [now, setNow] = useState(Date.now());
  const [issueVersion, setIssueVersion] = useState(0);

  const expiresAtMs = useMemo(() => (qrState.expiresAt ? new Date(qrState.expiresAt).getTime() : 0), [qrState.expiresAt]);
  const secondsRemaining = expiresAtMs ? Math.max(0, Math.ceil((expiresAtMs - now) / 1000)) : 0;
  const isExpired = status === 'ready' && secondsRemaining === 0;

  const issueQrToken = useCallback(async () => {
    if (!worker?.id) {
      return;
    }

    setStatus('loading');
    setError('');
    setCopyStatus('idle');
    setActionStatus('idle');
    setNow(Date.now());

    try {
      const response = await client.post('/tickets/qr-token', {
        employee_id: worker.id,
        ttl_seconds: DEFAULT_TTL_SECONDS
      });

      const token = response.data?.token || '';
      const expiresAt = response.data?.expires_at || '';
      const ttlSeconds = Number(response.data?.ttl_seconds || DEFAULT_TTL_SECONDS);
      const qrCodeUrl = await QRCode.toDataURL(token, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 320,
        color: {
          dark: '#103624',
          light: '#ffffff'
        }
      });

      setQrState({ token, qrCodeUrl, expiresAt, ttlSeconds });
      setStatus('ready');
    } catch (err) {
      setStatus('error');
      setError(err.response?.data?.error || 'Unable to issue QR code right now.');
    }
  }, [worker]);

  useEffect(() => {
    if (!worker?.id) {
      return undefined;
    }

    issueQrToken();
    return undefined;
  }, [issueQrToken, issueVersion, worker]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!autoRefresh || status !== 'ready' || !expiresAtMs) {
      return undefined;
    }

    const delay = Math.max(expiresAtMs - Date.now() - (AUTO_REFRESH_BUFFER_SECONDS * 1000), 0);
    if (delay > MAX_TIMEOUT_MS) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setIssueVersion((value) => value + 1);
    }, delay);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [autoRefresh, expiresAtMs, status]);

  async function handleCopyToken() {
    if (!qrState.token) {
      return;
    }

    try {
      const copied = await copyText(qrState.token);
      setCopyStatus(copied ? 'copied' : 'failed');
      if (copied) {
        window.setTimeout(() => setCopyStatus('idle'), 1500);
      }
    } catch {
      setCopyStatus('failed');
    }
  }

  function handleDownload() {
    if (!qrState.qrCodeUrl) {
      return;
    }

    downloadDataUrl(qrState.qrCodeUrl, `dangote-worker-qr-${worker.employee_number}.png`);
    setActionStatus('downloaded');
    window.setTimeout(() => setActionStatus('idle'), 1500);
  }

  function handlePrint() {
    if (!qrState.qrCodeUrl || !qrState.expiresAt) {
      return;
    }

    try {
      printQrCard({ worker, qrCodeUrl: qrState.qrCodeUrl, expiresAt: qrState.expiresAt });
      setActionStatus('printed');
      window.setTimeout(() => setActionStatus('idle'), 1500);
    } catch (err) {
      setActionStatus('failed');
      setError(err.message || 'Unable to open the print dialog.');
    }
  }

  return (
    <>
      <div className="worker-qr-summary">
        <div>
          <strong>{worker.name}</strong>
          <p>{worker.employee_number} - Badge {worker.badge_number}</p>
        </div>
        <span className={`badge ${isExpired ? 'badge-danger' : 'badge-success'}`}>
          {isExpired ? 'Expired' : `Live ${formatSecondsRemaining(secondsRemaining)}`}
        </span>
      </div>

      <div className="worker-qr-card">
        {status === 'loading' || status === 'idle' ? (
          <div className="worker-qr-empty-state">
            <div className="loading">Issuing signed QR token...</div>
          </div>
        ) : null}

        {status === 'error' ? (
          <div className="alert alert-error">{error}</div>
        ) : null}

        {status === 'ready' ? (
          <>
            <img src={qrState.qrCodeUrl} alt={`QR code for ${worker.name}`} className="worker-qr-image" />
            <div className="worker-qr-meta">
              <p>
                This QR code contains a signed worker token for the vendor interface. It expires after {Math.round(qrState.ttlSeconds / 60)} minutes and becomes invalid after one successful meal redemption.
              </p>
              <p>
                Expiry time: <strong>{new Date(qrState.expiresAt).toLocaleTimeString()}</strong>
              </p>
              {autoRefresh ? (
                <p className="worker-qr-refresh-note">Auto-refresh is enabled so the on-screen QR rotates before expiry.</p>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      {showToken ? (
        <div className="form-group">
          <label htmlFor="worker-qr-token">Signed QR Token</label>
          <textarea
            id="worker-qr-token"
            className="form-control worker-qr-token"
            value={qrState.token}
            readOnly
            rows={4}
          />
          <div className="text-muted worker-qr-help">
            Vendors can scan the live QR from the Vendor Interface camera flow or paste this signed token if camera access is unstable.
          </div>
        </div>
      ) : null}

      <div className="worker-qr-actions">
        {allowManualRefresh ? (
          <button type="button" className="btn btn-primary" onClick={() => setIssueVersion((value) => value + 1)}>
            Refresh QR
          </button>
        ) : null}
        {allowPortableActions ? (
          <>
            <button type="button" className="btn btn-secondary" onClick={handleCopyToken} disabled={!qrState.token}>
              {copyStatus === 'copied' ? 'Copied' : 'Copy Token'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleDownload} disabled={!qrState.qrCodeUrl}>
              Download PNG
            </button>
            <button type="button" className="btn btn-secondary" onClick={handlePrint} disabled={!qrState.qrCodeUrl}>
              Print QR
            </button>
          </>
        ) : null}
      </div>

      {showToken && copyStatus === 'failed' ? <div className="alert alert-warning">Copy failed on this device. Use the token field directly.</div> : null}
      {allowPortableActions && actionStatus === 'downloaded' ? <div className="alert alert-info">QR image downloaded.</div> : null}
      {allowPortableActions && actionStatus === 'printed' ? <div className="alert alert-info">Print window opened for the current QR.</div> : null}
      {allowPortableActions && actionStatus === 'failed' ? <div className="alert alert-warning">Print action failed. Check browser pop-up settings.</div> : null}
    </>
  );
}