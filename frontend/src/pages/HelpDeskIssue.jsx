import React, { useState } from 'react';
import client from '../api/client';
import WorkerQrCard from '../components/WorkerQrCard';

function buildInitialLookupState() {
  return {
    status: 'idle',
    employee: null,
    canConsume: null,
    message: '',
    error: ''
  };
}

function normalizeEmployee(payload) {
  if (!payload) {
    return null;
  }

  const id = payload.id || payload._id || null;
  if (!id) {
    return null;
  }

  return {
    ...payload,
    id: String(id)
  };
}

function renderWorkerIdentity(employee) {
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
        {employee.department ? <p><strong>Department:</strong> {employee.department}</p> : null}
        {employee.badge_number ? <p><strong>Badge Number:</strong> {employee.badge_number}</p> : null}
        <p><strong>Photo Check:</strong> {employee.photo_data_url ? 'Match the worker to the stored profile photo before issuing a token.' : 'No worker photo is stored yet. Request an updated profile photo for stronger verification.'}</p>
      </div>
    </div>
  );
}

export default function HelpDeskIssue() {
  const [badgeNumber, setBadgeNumber] = useState('');
  const [lookupState, setLookupState] = useState(buildInitialLookupState);

  const isLookingUp = lookupState.status === 'processing';

  async function handleLookup(event) {
    event.preventDefault();

    const normalizedBadge = badgeNumber.trim();
    if (!normalizedBadge) {
      setLookupState({
        status: 'failed',
        employee: null,
        canConsume: null,
        message: '',
        error: 'Enter a worker badge number before lookup.'
      });
      return;
    }

    setLookupState({ status: 'processing', employee: null, canConsume: null, message: '', error: '' });

    try {
      const response = await client.get(`/tickets/validate/${encodeURIComponent(normalizedBadge)}`);
      const employee = normalizeEmployee(response.data?.employee);

      if (!employee) {
        setLookupState({
          status: 'failed',
          employee: null,
          canConsume: null,
          message: '',
          error: 'Worker details could not be loaded for this badge.'
        });
        return;
      }

      setLookupState({
        status: 'succeeded',
        employee,
        canConsume: Boolean(response.data?.can_consume),
        message: response.data?.message || '',
        error: ''
      });
    } catch (err) {
      setLookupState({
        status: 'failed',
        employee: null,
        canConsume: null,
        message: '',
        error: err.response?.data?.error || 'Worker lookup failed. Confirm the badge number and try again.'
      });
    }
  }

  return (
    <div className="pg-wrap">
      <div className="pg-header vendor">
        <div className="pg-header-inner">
          <div>
            <h1 className="pg-title">Help Desk Token Issuance</h1>
            <p className="pg-subtitle">Assist workers without smartphones by verifying identity and issuing short-lived QR tokens.</p>
          </div>
        </div>
      </div>
      <div className="pg-body">
        <div className="card vendor-status-banner warning">
          <strong>Queue policy:</strong> Workers without phone access should be routed through help desk for assisted token issuance. At serving point, enforce no badge and no token means no meal.
        </div>

        <div className="card">
          <h2 style={{ marginBottom: '8px' }}>Lookup Worker by Badge</h2>
          <p className="text-muted mb-3">Confirm the worker identity before issuing a signed QR token.</p>
          <form onSubmit={handleLookup}>
            <label htmlFor="help-desk-badge" className="sr-only">Worker Badge Number</label>
            <input
              id="help-desk-badge"
              className="form-control"
              value={badgeNumber}
              onChange={(event) => setBadgeNumber(event.target.value)}
              placeholder="Enter badge number..."
              style={{ maxWidth: '500px', width: '100%', fontSize: '1rem', marginBottom: '12px' }}
            />
            <button type="submit" className="btn btn-primary" disabled={isLookingUp || !badgeNumber.trim()}>
              {isLookingUp ? 'Looking up...' : 'Lookup Worker'}
            </button>
          </form>

          {lookupState.status === 'failed' ? <div className="alert alert-error mt-3">{lookupState.error}</div> : null}
        </div>

        {lookupState.status === 'succeeded' && lookupState.employee ? (
          <>
            <div className="card">
              <div className={`alert ${lookupState.canConsume ? 'alert-info' : 'alert-warning'}`}>
                {lookupState.canConsume
                  ? 'Worker is currently eligible for at least one meal path. You can issue a token after identity confirmation.'
                  : lookupState.message || 'Worker is not currently eligible for this validation context. Issue token only when operational policy allows.'}
              </div>
              {renderWorkerIdentity(lookupState.employee)}
            </div>

            <div className="card worker-qr-page-card">
              <div className="card-title">Issue Signed QR Token</div>
              <p className="text-muted" style={{ marginBottom: '12px' }}>
                This token is short-lived and single-use after successful redemption. Print or share with the worker immediately.
              </p>
              <WorkerQrCard worker={lookupState.employee} autoRefresh />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
