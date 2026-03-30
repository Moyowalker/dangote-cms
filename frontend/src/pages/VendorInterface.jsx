import React, { useCallback, useEffect, useState } from 'react';
import client from '../api/client';
import QrScannerPanel from '../components/QrScannerPanel';

const REQUEST_TIMEOUT_MS = 8000;
const PENDING_ATTEMPT_STORAGE_KEY = 'dangote-vendor-pending-attempt';

function isOutcomeUnknownError(error) {
  return error.code === 'ECONNABORTED' || !error.response;
}

function buildInitialValidationState() {
  return { status: 'idle', data: null, error: null };
}

function buildInitialRedeemState() {
  return { status: 'idle', data: null, error: null, attempt: null, recoveryMessage: null };
}

function normalizeTransactionsPayload(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.tickets)) {
    return payload.tickets;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  return [];
}

function readPendingAttempt() {
  try {
    const stored = window.sessionStorage.getItem(PENDING_ATTEMPT_STORAGE_KEY);
    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed.badgeNumber !== 'string' || typeof parsed.mealType !== 'string' || typeof parsed.startedAt !== 'number') {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function writePendingAttempt(attempt) {
  try {
    window.sessionStorage.setItem(PENDING_ATTEMPT_STORAGE_KEY, JSON.stringify(attempt));
  } catch {
    // ignore storage failures in the UI path
  }
}

function clearPendingAttempt() {
  try {
    window.sessionStorage.removeItem(PENDING_ATTEMPT_STORAGE_KEY);
  } catch {
    // ignore storage failures in the UI path
  }
}

function findRecoveredTransaction(transactions, attempt) {
  if (!attempt) {
    return null;
  }

  const lowerBound = attempt.startedAt - (2 * 60 * 1000);

  return transactions.find((transaction) => {
    const consumedAt = new Date(transaction.consumed_at).getTime();
    return transaction.badge_number === attempt.badgeNumber
      && transaction.meal_type === attempt.mealType
      && Number.isFinite(consumedAt)
      && consumedAt >= lowerBound;
  }) || null;
}

function renderWorkerIdentity(employee, sourceLabel = null) {
  if (!employee) {
    return null;
  }

  return (
    <div className="vendor-worker-identity-card">
      <div className="vendor-worker-identity-media">
        {employee.photo_data_url ? (
          <img src={employee.photo_data_url} alt={`Worker profile for ${employee.name}`} className="vendor-worker-photo" />
        ) : (
          <div className="vendor-worker-photo placeholder">No Photo</div>
        )}
      </div>
      <div className="vendor-worker-identity-copy">
        <p><strong>Worker:</strong> {employee.name} ({employee.employee_number})</p>
        {sourceLabel ? <p><strong>Lookup source:</strong> {sourceLabel}</p> : null}
        {employee.department ? <p><strong>Department:</strong> {employee.department}</p> : null}
        {employee.badge_number ? <p><strong>Badge Number:</strong> {employee.badge_number}</p> : null}
        <p><strong>Photo Check:</strong> {employee.photo_data_url ? 'Compare the live worker to the stored profile photo before serving.' : 'No worker photo is stored yet. Ask admin to upload one for stronger verification.'}</p>
      </div>
    </div>
  );
}

export default function VendorInterface() {
  const [lookupMode, setLookupMode] = useState('badge');
  const [badgeNumber, setBadgeNumber] = useState('');
  const [qrToken, setQrToken] = useState('');
  const [mealType, setMealType] = useState('lunch');
  const [validationState, setValidationState] = useState(buildInitialValidationState);
  const [redeemState, setRedeemState] = useState(buildInitialRedeemState);
  const [transactions, setTransactions] = useState([]);
  const [checkingOutcome, setCheckingOutcome] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [identityConfirmed, setIdentityConfirmed] = useState(false);

  const fetchTransactions = useCallback(async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await client.get('/tickets/history', { params: { date: today } });
      const nextTransactions = normalizeTransactionsPayload(res.data);
      setTransactions(nextTransactions);
      return nextTransactions;
    } catch (err) {
      console.error(err);
      return [];
    }
  }, []);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  useEffect(() => {
    const pendingAttempt = readPendingAttempt();
    if (!pendingAttempt) {
      return;
    }

    setBadgeNumber(pendingAttempt.badgeNumber);
    setMealType(pendingAttempt.mealType);
    setRedeemState({
      status: 'unknown',
      data: null,
      error: 'A previous redemption attempt still needs verification.',
      attempt: pendingAttempt,
      recoveryMessage: 'Check the latest transaction before retrying this worker.'
    });
  }, []);

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }

    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const isValidating = validationState.status === 'processing';
  const isRedeeming = redeemState.status === 'processing';
  const isBusy = isValidating || isRedeeming || checkingOutcome;
  const disableActions = isBusy || !isOnline;
  const activeBadgeNumber = lookupMode === 'qr'
    ? validationState.data?.employee?.badge_number || ''
    : badgeNumber.trim();
  const requiresIdentityConfirmation = lookupMode === 'qr' && Boolean(activeBadgeNumber);

  async function runValidation({ mode = lookupMode, badgeInput = badgeNumber, qrInput = qrToken } = {}) {
    const normalizedBadge = badgeInput.trim();
    const normalizedQrToken = qrInput.trim();
    const isBadgeLookup = mode === 'badge';

    if (isBadgeLookup && !normalizedBadge) return;
    if (!isBadgeLookup && !normalizedQrToken) return;

    setValidationState({ status: 'processing', data: null, error: null });
    setRedeemState(buildInitialRedeemState());
    setIdentityConfirmed(false);
    try {
      const res = isBadgeLookup
        ? await client.get(`/tickets/validate/${encodeURIComponent(normalizedBadge)}`, {
          params: { meal_type: mealType },
          timeout: REQUEST_TIMEOUT_MS
        })
        : await client.post('/tickets/validate-token', {
          token: normalizedQrToken,
          meal_type: mealType,
          canteen_location: 'Main Canteen'
        }, {
          timeout: REQUEST_TIMEOUT_MS
        });

      setValidationState({ status: 'succeeded', data: res.data, error: null });
    } catch (err) {
      setValidationState({
        status: 'failed',
        data: null,
        error: err.response?.data?.error || (isBadgeLookup
          ? 'Validation failed. Check the badge number and try again.'
          : 'QR validation failed. Scan again or switch to badge lookup.')
      });
    }
  }


  async function handleValidate(e) {
    e.preventDefault();
    await runValidation();
  }

  async function handleQrDetected(detectedToken) {
    setQrToken(detectedToken);
    setScannerOpen(false);
    await runValidation({ mode: 'qr', qrInput: detectedToken });
  }
  async function handleRedeem(e) {
    e.preventDefault();
    const normalizedBadge = activeBadgeNumber;
    if (!normalizedBadge) return;
    if (lookupMode === 'qr' && !identityConfirmed) return;

    const attempt = {
      badgeNumber: normalizedBadge,
      mealType,
      startedAt: Date.now()
    };

    writePendingAttempt(attempt);
    setRedeemState({ status: 'processing', data: null, error: null, attempt, recoveryMessage: null });
    try {
      const requestBody = {
        badge_number: normalizedBadge,
        meal_type: mealType,
        canteen_location: 'Main Canteen'
      };

      if (lookupMode === 'qr' && qrToken.trim()) {
        requestBody.token = qrToken.trim();
      }

      const res = await client.post('/tickets/consume', {
        ...requestBody
      }, {
        timeout: REQUEST_TIMEOUT_MS
      });
      setRedeemState({ status: 'succeeded', data: res.data, error: null, attempt, recoveryMessage: null });
      clearPendingAttempt();
      setBadgeNumber('');
      setQrToken('');
      setValidationState(buildInitialValidationState());
      await fetchTransactions();
    } catch (err) {
      if (isOutcomeUnknownError(err)) {
        setRedeemState({
          status: 'unknown',
          data: null,
          error: 'The request timed out or the network dropped before the result came back.',
          attempt,
          recoveryMessage: 'Check the latest transaction before retrying this worker.'
        });
        return;
      }

      setRedeemState({
        status: 'failed',
        data: null,
        error: err.response?.data?.error || 'Redemption failed',
        attempt,
        recoveryMessage: null
      });
      clearPendingAttempt();
    }
  }

  async function handleCheckLatestTransaction() {
    if (!redeemState.attempt) {
      return;
    }

    setCheckingOutcome(true);
    try {
      const nextTransactions = await fetchTransactions();
      const recovered = findRecoveredTransaction(nextTransactions, redeemState.attempt);

      if (recovered) {
        setRedeemState({
          status: 'succeeded',
          data: {
            employee: {
              name: recovered.employee_name,
              employee_number: recovered.employee_number
            },
            record: recovered,
            transaction: {
              transaction_reference: recovered.id
            },
            remaining: null,
            recovered: true
          },
          error: null,
          attempt: redeemState.attempt,
          recoveryMessage: 'Latest transaction history shows this meal was already recorded.'
        });
        clearPendingAttempt();
      } else {
        setRedeemState((current) => ({
          ...current,
          recoveryMessage: isOnline
            ? 'No matching transaction was found yet. Do not retry immediately. Confirm with operations if the queue is moving.'
            : 'Still offline. Reconnect before checking again or attempting another redemption.'
        }));
      }
    } finally {
      setCheckingOutcome(false);
    }
  }

  return (
    <div className="pg-wrap">
      <div className="pg-header vendor">
        <div className="pg-header-inner">
          <div>
            <h1 className="pg-title">QR Scan and Redemption</h1>
            <p className="pg-subtitle">Scan worker QR codes, validate eligibility, and record meal redemptions</p>
          </div>
        </div>
      </div>
      <div className="pg-body">

      <QrScannerPanel
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={handleQrDetected}
      />

      {!isOnline && (
        <div className="card vendor-status-banner offline">
          <strong>Offline:</strong> the network is down. Do not retry a worker until the connection returns and you check the latest transaction.
        </div>
      )}

      {isOnline && redeemState.status === 'unknown' && (
        <div className="card vendor-status-banner warning">
          <strong>Recovery mode:</strong> this screen is holding a previous redemption attempt for verification. Check the latest transaction before serving or retrying.
        </div>
      )}

      <div className="card">
        <div className="vendor-redeem-box">
          <h2 style={{ marginBottom: '8px' }}>Validate and Redeem</h2>
          <p className="text-muted mb-3">Use badge lookup or scan a worker QR code, then record the meal redemption.</p>
          <form onSubmit={handleValidate}>
            <div className="vendor-mode-row" role="group" aria-label="Lookup mode">
              <button
                type="button"
                className={`btn ${lookupMode === 'badge' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => {
                  setLookupMode('badge');
                  setValidationState(buildInitialValidationState());
                  setIdentityConfirmed(false);
                }}
                disabled={isBusy}
              >
                Badge Lookup
              </button>
              <button
                type="button"
                className={`btn ${lookupMode === 'qr' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => {
                  setLookupMode('qr');
                  setValidationState(buildInitialValidationState());
                  setIdentityConfirmed(false);
                }}
                disabled={isBusy}
              >
                QR Token
              </button>
            </div>

            {lookupMode === 'badge' ? (
              <>
                <label htmlFor="badge-number" className="sr-only">Badge Number</label>
                <input
                  id="badge-number"
                  className="form-control"
                  value={badgeNumber}
                  onChange={e => setBadgeNumber(e.target.value)}
                  placeholder="Enter badge number..."
                  style={{ maxWidth: '500px', width: '100%', fontSize: '1rem', marginBottom: '12px', display: 'block', margin: '0 auto 12px' }}
                />
              </>
            ) : (
              <>
                <div className="vendor-qr-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setScannerOpen(true)}
                    disabled={disableActions}
                  >
                    Use Camera
                  </button>
                </div>
                <label htmlFor="qr-token" className="sr-only">QR Token</label>
                <textarea
                  id="qr-token"
                  className="form-control"
                  value={qrToken}
                  onChange={e => setQrToken(e.target.value)}
                  placeholder="Scan or paste signed QR token..."
                  rows={4}
                  style={{ maxWidth: '500px', width: '100%', fontSize: '0.95rem', marginBottom: '12px', display: 'block', margin: '0 auto 12px' }}
                />
                <p className="text-muted" style={{ maxWidth: '500px', margin: '0 auto 12px' }}>
                  Camera scan validates automatically when a signed QR token is detected. If the device camera is unstable, paste the token instead.
                </p>
              </>
            )}
            <label htmlFor="meal-type" className="sr-only">Meal Type</label>
            <select
              id="meal-type"
              className="form-control"
              value={mealType}
              onChange={e => setMealType(e.target.value)}
              style={{ maxWidth: '500px', width: '100%', margin: '0 auto 12px' }}
            >
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
            </select>
            <button
              type="submit"
              className="btn btn-secondary"
              disabled={disableActions || (lookupMode === 'badge' ? !badgeNumber.trim() : !qrToken.trim())}
              style={{ padding: '10px 32px', fontSize: '1rem', marginTop: '8px' }}
            >
              {isValidating ? 'Validating...' : 'Validate'}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleRedeem}
              disabled={disableActions || !activeBadgeNumber || (requiresIdentityConfirmation && !identityConfirmed)}
              style={{ padding: '10px 32px', fontSize: '1rem', marginTop: '8px', marginLeft: '10px' }}
            >
              {isRedeeming ? 'Redeeming...' : 'Redeem'}
            </button>
          </form>

          {validationState.status !== 'idle' && (
            <div className={`vendor-result ${validationState.status === 'processing' ? 'info' : validationState.status === 'succeeded' && validationState.data?.can_consume ? 'success' : 'error'}`} style={{ maxWidth: '500px', margin: '20px auto 0' }}>
              {validationState.status === 'processing' ? (
                <>
                  <h3 style={{ color: '#0c5460', marginBottom: '8px' }}>Checking eligibility</h3>
                  <p>Please wait for the backend to confirm this worker before serving.</p>
                </>
              ) : validationState.status === 'failed' ? (
                <p>{validationState.error}</p>
              ) : (
                <>
                  {renderWorkerIdentity(validationState.data?.employee, lookupMode === 'qr' ? 'Signed QR token' : 'Badge lookup')}
                  <p><strong>Meal Type:</strong> {validationState.data?.meal_type}</p>
                  <p><strong>Status:</strong> {validationState.data?.can_consume ? 'Eligible' : 'Already consumed'}</p>
                  <p><strong>Remaining balance:</strong> {validationState.data?.remaining ?? 0}</p>
                  {!validationState.data?.can_consume && validationState.data?.message && (
                    <p><strong>Next step:</strong> {validationState.data.message}</p>
                  )}
                </>
              )}
            </div>
          )}

          {requiresIdentityConfirmation ? (
            <div className="vendor-confirmation-check">
              <label htmlFor="vendor-identity-confirmation">
                <input
                  id="vendor-identity-confirmation"
                  type="checkbox"
                  checked={identityConfirmed}
                  onChange={(event) => setIdentityConfirmed(event.target.checked)}
                  disabled={disableActions}
                />
                <span>I have visually confirmed that the worker presenting this QR matches the validated profile.</span>
              </label>
            </div>
          ) : null}

          {redeemState.status !== 'idle' && (
            <div className={`vendor-result ${redeemState.status === 'processing' ? 'info' : redeemState.status === 'succeeded' ? 'success' : redeemState.status === 'unknown' ? 'warning' : 'error'}`} style={{ maxWidth: '500px', margin: '20px auto 0' }}>
              {redeemState.status === 'processing' ? (
                <>
                  <h3 style={{ color: '#0c5460', marginBottom: '8px' }}>Processing redemption</h3>
                  <p>Do not resubmit while the backend is processing this meal.</p>
                </>
              ) : redeemState.status === 'succeeded' ? (
                <>
                  <h3 style={{ color: '#155724', marginBottom: '8px' }}>
                    {redeemState.data?.recovered ? 'Meal Found in Recent History' : 'Meal Recorded Successfully'}
                  </h3>
                  {redeemState.data?.employee ? renderWorkerIdentity(redeemState.data.employee) : null}
                  <p><strong>Meal Type:</strong> {redeemState.data?.record?.meal_type}</p>
                  <p><strong>Transaction reference:</strong> #{redeemState.data?.transaction?.transaction_reference || redeemState.data?.record?.id}</p>
                  <p><strong>Remaining balance:</strong> {redeemState.data?.remaining ?? 'Unavailable from recovery lookup'}</p>
                  {redeemState.recoveryMessage && <p><strong>Status note:</strong> {redeemState.recoveryMessage}</p>}
                </>
              ) : redeemState.status === 'unknown' ? (
                <>
                  <h3 style={{ color: '#856404', marginBottom: '8px' }}>Transaction status is unknown</h3>
                  <p>{redeemState.error}</p>
                  <p>{redeemState.recoveryMessage}</p>
                  <div className="vendor-action-row">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleCheckLatestTransaction}
                      disabled={checkingOutcome || !isOnline}
                    >
                      {checkingOutcome ? 'Checking latest...' : 'Check latest transaction'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h3 style={{ color: '#721c24', marginBottom: '8px' }}>Redemption Failed</h3>
                  <p>{redeemState.error}</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Today's Meal Records</div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Worker</th>
                <th>Meal Type</th>
                <th>Badge</th>
                <th>Consumed At</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-muted" style={{ padding: '20px' }}>No transactions today</td></tr>
              ) : transactions.map(t => (
                <tr key={t.id}>
                  <td>{t.id}</td>
                  <td>{t.employee_name || '-'} <span className="text-muted">({t.employee_number || '-'})</span></td>
                  <td><span className="badge badge-info">{t.meal_type}</span></td>
                  <td><code style={{ fontSize: '0.75rem' }}>{t.badge_number || '-'}</code></td>
                  <td>{new Date(t.consumed_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </div>
  );
}
