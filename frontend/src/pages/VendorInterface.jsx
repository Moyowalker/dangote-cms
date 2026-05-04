import React, { useCallback, useEffect, useRef, useState } from 'react';
import client from '../api/client';
import QrScannerPanel from '../components/QrScannerPanel';
import {
  enqueueOfflineRedemption,
  getOfflineDeviceProfile,
  getVendorValidationSnapshot,
  hasPendingOfflineRedemption,
  recordOfflineActivityBatch,
  readOfflineRedemptionQueue,
  removeOfflineRedemptionEntry,
  storeVendorValidationSnapshot,
  updateOfflineRedemptionEntry,
  writeOfflineRedemptionQueue
} from '../utils/offlineVendorQueue';

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

function buildInitialSyncState() {
  return { status: 'idle', message: '' };
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

function buildCachedValidationData(snapshot) {
  if (!snapshot?.data) {
    return null;
  }

  return {
    ...snapshot.data,
    offline_cached: true,
    cached_at: snapshot.cachedAt,
    message: snapshot.data?.message || 'Using the last successful same-day validation stored on this device while offline.'
  };
}

function formatQueueTimestamp(value) {
  if (!value) {
    return 'Unknown time';
  }

  return new Date(value).toLocaleTimeString();
}

function buildOfflineActivitySummary(processedEntries) {
  const matchedEntries = processedEntries.filter((entry) => entry.client_outcome === 'synced' || entry.client_outcome === 'duplicate').length;
  const unresolvedEntries = processedEntries.filter((entry) => entry.client_outcome === 'sync_failed').length;

  return {
    total_entries: processedEntries.length,
    matched_entries: matchedEntries,
    unresolved_entries: unresolvedEntries,
    missing_transaction_links: 0,
    employee_not_found_entries: 0,
    client_failed_entries: unresolvedEntries
  };
}

function buildOfflineActivityEntries(processedEntries) {
  return processedEntries.map((entry) => ({
    local_reference: entry.local_reference,
    badge_number: entry.badge_number,
    meal_type: entry.meal_type,
    queued_at: entry.queued_at,
    client_outcome: entry.client_outcome,
    client_error: entry.client_error,
    employee_name: entry.employee?.name || null,
    employee_number: entry.employee?.employee_number || null,
    status: entry.client_outcome === 'sync_failed' ? 'unresolved' : 'matched',
    resolution_reason: entry.client_outcome === 'duplicate'
      ? 'Server already had a matching meal redemption for this queued item.'
      : entry.client_outcome === 'sync_failed'
        ? (entry.client_error || 'Queued redemption still needs retry.')
        : 'Queued redemption synced successfully.'
  }));
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
  const [collectorBadgeNumber, setCollectorBadgeNumber] = useState('');
  const [offlineQueue, setOfflineQueue] = useState([]);
  const [syncState, setSyncState] = useState(buildInitialSyncState);
  const previousOnlineRef = useRef(isOnline);

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
    setOfflineQueue(readOfflineRedemptionQueue());
  }, []);

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

  const syncOfflineQueue = useCallback(async (targetEntryId = null) => {
    const queuedItems = targetEntryId
      ? readOfflineRedemptionQueue().filter((item) => item.id === targetEntryId)
      : readOfflineRedemptionQueue();
    if (!queuedItems.length || !isOnline) {
      return;
    }

    setSyncState({ status: 'processing', message: `Syncing ${queuedItems.length} queued redemption${queuedItems.length === 1 ? '' : 's'}...` });

    let remainingItems = [...queuedItems];
    let syncedCount = 0;
    let duplicateCount = 0;
    let failureCount = 0;
    const processedEntries = [];

    for (const item of queuedItems) {
      try {
        await client.post('/tickets/consume', {
          badge_number: item.badgeNumber,
          meal_type: item.mealType,
          canteen_location: item.canteenLocation
        }, {
          timeout: REQUEST_TIMEOUT_MS
        });

        syncedCount += 1;
        processedEntries.push({
          local_reference: item.id,
          badge_number: item.badgeNumber,
          meal_type: item.mealType,
          queued_at: item.queuedAt,
          client_outcome: 'synced',
          client_error: null,
          employee: item.employee || null
        });
        remainingItems = remainingItems.filter((entry) => entry.id !== item.id);
      } catch (err) {
        if (err.response?.status === 409) {
          duplicateCount += 1;
          processedEntries.push({
            local_reference: item.id,
            badge_number: item.badgeNumber,
            meal_type: item.mealType,
            queued_at: item.queuedAt,
            client_outcome: 'duplicate',
            client_error: null,
            employee: item.employee || null
          });
          remainingItems = remainingItems.filter((entry) => entry.id !== item.id);
          continue;
        }

        failureCount += 1;
        const errorMessage = err.response?.data?.error || err.message || 'Sync failed';
        processedEntries.push({
          local_reference: item.id,
          badge_number: item.badgeNumber,
          meal_type: item.mealType,
          queued_at: item.queuedAt,
          client_outcome: 'sync_failed',
          client_error: errorMessage,
          employee: item.employee || null
        });
        remainingItems = remainingItems.map((entry) => (entry.id === item.id
          ? {
            ...entry,
            attemptCount: Number(entry.attemptCount || 0) + 1,
            lastError: errorMessage
          }
          : entry));
      }
    }

    writeOfflineRedemptionQueue(remainingItems);
    setOfflineQueue(remainingItems);

    let activityUploadError = null;
    if (processedEntries.length > 0) {
      const deviceProfile = getOfflineDeviceProfile();
      const batchDate = processedEntries[0]?.queued_at
        ? new Date(processedEntries[0].queued_at).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];
      const batchPayload = {
        device_id: deviceProfile.id,
        device_label: deviceProfile.label,
        batch_date: batchDate,
        canteen_location: 'Main Canteen',
        redemptions: processedEntries.map((entry) => ({
          local_reference: entry.local_reference,
          badge_number: entry.badge_number,
          meal_type: entry.meal_type,
          queued_at: entry.queued_at,
          client_outcome: entry.client_outcome,
          client_error: entry.client_error
        }))
      };

      let uploadedBatch = null;
      try {
        const response = await client.post('/reconciliation/offline-batches', batchPayload, {
          timeout: REQUEST_TIMEOUT_MS
        });
        uploadedBatch = response.data;
      } catch (err) {
        activityUploadError = err.response?.data?.error || err.message || 'Offline activity upload failed';
      }

      recordOfflineActivityBatch({
        id: uploadedBatch?.id || `local-${Date.now()}`,
        server_batch_id: uploadedBatch?.id || null,
        recorded_at: uploadedBatch?.created_at || new Date().toISOString(),
        batch_date: uploadedBatch?.batch_date || batchPayload.batch_date,
        device_id: uploadedBatch?.device_id || batchPayload.device_id,
        device_label: uploadedBatch?.device_label || batchPayload.device_label,
        canteen_location: uploadedBatch?.canteen_location || batchPayload.canteen_location,
        status: uploadedBatch?.status || (failureCount ? 'needs_review' : 'reconciled'),
        upload_status: uploadedBatch ? 'uploaded' : 'upload_failed',
        upload_error: activityUploadError,
        summary: uploadedBatch?.summary || buildOfflineActivitySummary(processedEntries),
        entries: uploadedBatch?.entries || buildOfflineActivityEntries(processedEntries)
      });
    }

    if (syncedCount || duplicateCount) {
      await fetchTransactions();
    }

    setSyncState({
      status: failureCount ? 'warning' : 'success',
      message: `Synced ${syncedCount} queued redemption${syncedCount === 1 ? '' : 's'}${duplicateCount ? `, cleared ${duplicateCount} duplicate${duplicateCount === 1 ? '' : 's'}` : ''}${failureCount ? `, ${failureCount} still pending` : ''}${activityUploadError ? '. Activity saved locally; reconciliation upload will need follow-up.' : '.'}`
    });
  }, [fetchTransactions, isOnline]);

  useEffect(() => {
    const wasOnline = previousOnlineRef.current;
    previousOnlineRef.current = isOnline;

    if (!wasOnline && isOnline && offlineQueue.length > 0) {
      syncOfflineQueue();
    }
  }, [isOnline, offlineQueue.length, syncOfflineQueue]);

  const isValidating = validationState.status === 'processing';
  const isRedeeming = redeemState.status === 'processing';
  const isBusy = isValidating || isRedeeming || checkingOutcome;
  const disableActions = isBusy;
  const activeBadgeNumber = lookupMode === 'qr'
    ? validationState.data?.employee?.badge_number || ''
    : badgeNumber.trim();
  const requiresIdentityConfirmation = lookupMode === 'qr' && Boolean(activeBadgeNumber);
  const canRedeemOffline = !isOnline
    && lookupMode === 'badge'
    && validationState.status === 'succeeded'
    && validationState.data?.offline_cached
    && validationState.data?.can_consume;

  async function runValidation({ mode = lookupMode, badgeInput = badgeNumber, qrInput = qrToken } = {}) {
    const normalizedBadge = badgeInput.trim();
    const normalizedQrToken = qrInput.trim();
    const isBadgeLookup = mode === 'badge';

    if (isBadgeLookup && !normalizedBadge) return;
    if (!isBadgeLookup && !normalizedQrToken) return;

    setValidationState({ status: 'processing', data: null, error: null });
    setRedeemState(buildInitialRedeemState());
    setIdentityConfirmed(false);
    setCollectorBadgeNumber('');

    if (!isOnline) {
      if (!isBadgeLookup) {
        setValidationState({
          status: 'failed',
          data: null,
          error: 'QR token validation requires a live connection. Switch to badge lookup with a cached worker validation on this device.'
        });
        return;
      }

      const cachedSnapshot = getVendorValidationSnapshot({ badgeNumber: normalizedBadge, mealType });
      const cachedData = buildCachedValidationData(cachedSnapshot);

      if (cachedData) {
        setValidationState({ status: 'succeeded', data: cachedData, error: null });
      } else {
        setValidationState({
          status: 'failed',
          data: null,
          error: 'This badge has not been validated online on this device today. Reconnect before serving or use another connected device.'
        });
      }
      return;
    }

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

      if (isBadgeLookup) {
        storeVendorValidationSnapshot({
          badgeNumber: normalizedBadge,
          mealType,
          data: res.data
        });
      }

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

    if (!isOnline) {
      if (!canRedeemOffline) {
        return;
      }

      if (hasPendingOfflineRedemption({ badgeNumber: normalizedBadge, mealType })) {
        setRedeemState({
          status: 'failed',
          data: null,
          error: 'An offline redemption for this worker and meal is already queued on this device.',
          attempt: null,
          recoveryMessage: null
        });
        return;
      }

      const queuedEntry = enqueueOfflineRedemption({
        badgeNumber: normalizedBadge,
        mealType,
        employee: validationState.data?.employee || null,
        canteenLocation: 'Main Canteen'
      });

      const nextQueue = readOfflineRedemptionQueue();
      setOfflineQueue(nextQueue);
      setRedeemState({
        status: 'queued',
        data: {
          employee: validationState.data?.employee || null,
          record: {
            id: queuedEntry.id,
            meal_type: mealType
          },
          transaction: null,
          remaining: validationState.data?.remaining ?? null
        },
        error: null,
        attempt: null,
        recoveryMessage: 'Queued locally. This device will sync the redemption automatically when the network returns.'
      });
      setSyncState({ status: 'warning', message: `Offline queue now has ${nextQueue.length} pending redemption${nextQueue.length === 1 ? '' : 's'}.` });
      setBadgeNumber('');
      setQrToken('');
      setValidationState(buildInitialValidationState());
      return;
    }

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

      if (validationState.data?.delegation) {
        requestBody.collector_badge_number = collectorBadgeNumber.trim();
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

  function handleRemoveQueuedEntry(entryId) {
    const nextQueue = removeOfflineRedemptionEntry(entryId);
    setOfflineQueue(nextQueue);
    setSyncState({
      status: nextQueue.length ? 'warning' : 'success',
      message: nextQueue.length
        ? `${nextQueue.length} queued redemption${nextQueue.length === 1 ? '' : 's'} remain on this device.`
        : 'Offline queue cleared on this device.'
    });
  }

  async function handleRetryQueuedEntry(entryId) {
    if (!isOnline) {
      return;
    }

    const nextQueue = updateOfflineRedemptionEntry(entryId, { lastError: null });
    setOfflineQueue(nextQueue);
    await syncOfflineQueue(entryId);
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
          <strong>Offline:</strong> the network is down. Use badge lookup only for workers already validated online on this device today. Any offline redemption will be queued and synced later.
        </div>
      )}

      {isOnline && redeemState.status === 'unknown' && (
        <div className="card vendor-status-banner warning">
          <strong>Recovery mode:</strong> this screen is holding a previous redemption attempt for verification. Check the latest transaction before serving or retrying.
        </div>
      )}

      {(offlineQueue.length > 0 || syncState.status !== 'idle') && (
        <div className={`card vendor-status-banner ${syncState.status === 'success' ? 'info' : syncState.status === 'warning' ? 'warning' : ''}`}>
          <strong>Offline queue:</strong> {syncState.message || `${offlineQueue.length} redemption${offlineQueue.length === 1 ? '' : 's'} pending sync.`}
          {isOnline && offlineQueue.length > 0 ? (
            <button type="button" className="btn btn-secondary vendor-sync-button" onClick={syncOfflineQueue} disabled={syncState.status === 'processing'}>
              {syncState.status === 'processing' ? 'Syncing...' : 'Sync queued redemptions'}
            </button>
          ) : null}
          {offlineQueue.length > 0 ? (
            <div className="vendor-offline-queue-list">
              {offlineQueue.map((item) => (
                <div key={item.id} className="vendor-offline-queue-item">
                  <div>
                    <strong>{item.employee?.name || item.badgeNumber}</strong>
                    <span>{item.mealType} queued at {formatQueueTimestamp(item.queuedAt)}</span>
                    {item.lastError ? <span className="vendor-offline-queue-error">Last error: {item.lastError}</span> : null}
                  </div>
                  <div className="vendor-offline-queue-actions">
                    <span className={`badge ${item.lastError ? 'badge-warning' : 'badge-secondary'}`}>
                      {item.lastError ? 'Retry pending' : 'Pending sync'}
                    </span>
                    {isOnline ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleRetryQueuedEntry(item.id)}
                        disabled={syncState.status === 'processing'}
                      >
                        Retry Item
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => handleRemoveQueuedEntry(item.id)}
                      disabled={syncState.status === 'processing'}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
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
              disabled={disableActions || (lookupMode === 'badge' ? !badgeNumber.trim() : !isOnline || !qrToken.trim())}
              style={{ padding: '10px 32px', fontSize: '1rem', marginTop: '8px' }}
            >
              {isValidating ? 'Validating...' : 'Validate'}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleRedeem}
              disabled={disableActions || !activeBadgeNumber || (requiresIdentityConfirmation && !identityConfirmed) || (validationState.data?.delegation && !collectorBadgeNumber.trim()) || (!isOnline && !canRedeemOffline)}
              style={{ padding: '10px 32px', fontSize: '1rem', marginTop: '8px', marginLeft: '10px' }}
            >
              {isRedeeming ? 'Redeeming...' : !isOnline && canRedeemOffline ? 'Queue Redeem' : 'Redeem'}
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
                  {validationState.data?.delegation ? (
                    <div className="alert alert-warning" style={{ marginBottom: '12px' }}>
                      <strong>Delegated collection:</strong> this meal belongs to the absent worker above, but it is approved for collection by {validationState.data.delegation.collector?.name}
                      {validationState.data.delegation.collector?.badge_number ? ` (Badge ${validationState.data.delegation.collector.badge_number})` : ''}.
                      {validationState.data.delegation.reason ? ` Reason: ${validationState.data.delegation.reason}.` : ''}
                    </div>
                  ) : null}
                  <p><strong>Meal Type:</strong> {validationState.data?.meal_type}</p>
                  <p><strong>Status:</strong> {validationState.data?.can_consume ? 'Eligible' : 'Already consumed'}</p>
                  <p><strong>Remaining balance:</strong> {validationState.data?.remaining ?? 0}</p>
                  {validationState.data?.offline_cached && (
                    <p><strong>Offline mode:</strong> Using cached same-day validation from {formatQueueTimestamp(validationState.data.cached_at)}. If you queue this redemption now, it will sync when the device reconnects.</p>
                  )}
                  {!validationState.data?.can_consume && validationState.data?.message && (
                    <p><strong>Next step:</strong> {validationState.data.message}</p>
                  )}
                </>
              )}
            </div>
          )}

          {validationState.data?.delegation ? (
            <div className="vendor-confirmation-check" style={{ maxWidth: '500px', margin: '16px auto 0' }}>
              <label htmlFor="collector-badge-number" style={{ display: 'block', marginBottom: '8px' }}>Approved Collector Badge</label>
              <input
                id="collector-badge-number"
                className="form-control"
                aria-label="Approved Collector Badge"
                value={collectorBadgeNumber}
                onChange={(event) => setCollectorBadgeNumber(event.target.value)}
                placeholder="Enter approved collector badge before redeeming"
                disabled={disableActions}
              />
            </div>
          ) : null}

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
                <span>{validationState.data?.delegation
                  ? 'I have visually confirmed that the approved collector presenting this token matches the delegated collection approval and the worker details shown.'
                  : 'I have visually confirmed that the worker presenting this QR matches the validated profile.'}</span>
              </label>
            </div>
          ) : null}

          {redeemState.status !== 'idle' && (
            <div className={`vendor-result ${redeemState.status === 'processing' ? 'info' : redeemState.status === 'succeeded' ? 'success' : redeemState.status === 'queued' || redeemState.status === 'unknown' ? 'warning' : 'error'}`} style={{ maxWidth: '500px', margin: '20px auto 0' }}>
              {redeemState.status === 'processing' ? (
                <>
                  <h3 style={{ color: '#0c5460', marginBottom: '8px' }}>Processing redemption</h3>
                  <p>Do not resubmit while the backend is processing this meal.</p>
                </>
              ) : redeemState.status === 'queued' ? (
                <>
                  <h3 style={{ color: '#856404', marginBottom: '8px' }}>Queued For Sync</h3>
                  {redeemState.data?.employee ? renderWorkerIdentity(redeemState.data.employee) : null}
                  <p><strong>Meal Type:</strong> {redeemState.data?.record?.meal_type}</p>
                  <p><strong>Queue reference:</strong> #{redeemState.data?.record?.id}</p>
                  {redeemState.recoveryMessage ? <p><strong>Status note:</strong> {redeemState.recoveryMessage}</p> : null}
                </>
              ) : redeemState.status === 'succeeded' ? (
                <>
                  <h3 style={{ color: '#155724', marginBottom: '8px' }}>
                    {redeemState.data?.recovered ? 'Meal Found in Recent History' : 'Meal Recorded Successfully'}
                  </h3>
                  {redeemState.data?.employee ? renderWorkerIdentity(redeemState.data.employee) : null}
                  {redeemState.data?.delegation ? (
                    <p><strong>Collected by:</strong> {redeemState.data.delegation.collector?.name} ({redeemState.data.delegation.collector?.badge_number})</p>
                  ) : null}
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
