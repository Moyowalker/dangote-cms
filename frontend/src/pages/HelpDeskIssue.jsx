import React, { useEffect, useState } from 'react';
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
  const [issueMode, setIssueMode] = useState('standard');
  const [collectorBadgeNumber, setCollectorBadgeNumber] = useState('');
  const [delegationReason, setDelegationReason] = useState('');
  const [delegationState, setDelegationState] = useState({
    status: 'idle',
    entries: [],
    hidden: false,
    error: '',
    actionId: ''
  });

  const isLookingUp = lookupState.status === 'processing';

  async function fetchDelegations() {
    setDelegationState((current) => ({ ...current, status: 'loading', error: '' }));

    try {
      const response = await client.get('/tickets/delegations', { params: { status: 'all' } });
      setDelegationState({
        status: 'succeeded',
        entries: Array.isArray(response.data?.entries) ? response.data.entries : [],
        hidden: false,
        error: '',
        actionId: ''
      });
    } catch (err) {
      if (err.response?.status === 403) {
        setDelegationState({ status: 'hidden', entries: [], hidden: true, error: '', actionId: '' });
        return;
      }

      setDelegationState({
        status: 'failed',
        entries: [],
        hidden: false,
        error: err.response?.data?.error || 'Failed to load delegated collection approvals.',
        actionId: ''
      });
    }
  }

  async function handleApproveDelegation(approvalId) {
    setDelegationState((current) => ({ ...current, actionId: approvalId, error: '' }));

    try {
      await client.patch(`/tickets/delegations/${approvalId}/approve`, {});
      await fetchDelegations();
    } catch (err) {
      setDelegationState((current) => ({
        ...current,
        actionId: '',
        error: err.response?.data?.error || 'Failed to approve delegated collection request.'
      }));
    }
  }

  useEffect(() => {
    fetchDelegations();
  }, []);

  async function handleRevokeDelegation(approvalId) {
    setDelegationState((current) => ({ ...current, actionId: approvalId, error: '' }));

    try {
      await client.patch(`/tickets/delegations/${approvalId}/revoke`, {});
      await fetchDelegations();
    } catch (err) {
      setDelegationState((current) => ({
        ...current,
        actionId: '',
        error: err.response?.data?.error || 'Failed to revoke delegated collection approval.'
      }));
    }
  }

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
      setIssueMode('standard');
      setCollectorBadgeNumber('');
      setDelegationReason('');
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
              <div className="vendor-mode-row" role="group" aria-label="Issuance mode" style={{ marginBottom: '12px' }}>
                <button
                  type="button"
                  className={`btn ${issueMode === 'standard' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setIssueMode('standard')}
                >
                  Standard Token
                </button>
                <button
                  type="button"
                  className={`btn ${issueMode === 'delegated' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setIssueMode('delegated')}
                >
                  Delegated Collection
                </button>
              </div>

              {issueMode === 'delegated' ? (
                <div style={{ marginBottom: '16px' }}>
                  <div className="alert alert-warning" style={{ marginBottom: '12px' }}>
                    Delegated collection requires same-day admin approval. Enter the approved collector badge and the reason for this exception.
                  </div>
                  <label htmlFor="delegated-collector-badge">Approved Collector Badge</label>
                  <input
                    id="delegated-collector-badge"
                    className="form-control"
                    value={collectorBadgeNumber}
                    onChange={(event) => setCollectorBadgeNumber(event.target.value)}
                    placeholder="Enter approved collector badge number..."
                    style={{ maxWidth: '500px', width: '100%', marginBottom: '12px' }}
                  />
                  <label htmlFor="delegation-reason">Delegation Reason</label>
                  <textarea
                    id="delegation-reason"
                    className="form-control"
                    value={delegationReason}
                    onChange={(event) => setDelegationReason(event.target.value)}
                    placeholder="Why is this worker not able to collect personally today?"
                    rows={3}
                    style={{ maxWidth: '500px', width: '100%' }}
                  />
                </div>
              ) : null}
              <WorkerQrCard
                worker={lookupState.employee}
                autoRefresh
                issueRequest={issueMode === 'delegated' && collectorBadgeNumber.trim() && delegationReason.trim()
                  ? {
                    delegated_to_badge_number: collectorBadgeNumber.trim(),
                    delegation_reason: delegationReason.trim()
                  }
                  : null}
              />
            </div>
          </>
        ) : null}

        {!delegationState.hidden ? (
          <div className="card">
            <div className="card-title">Delegated Meal Requests & Approvals</div>
            {delegationState.status === 'loading' ? (
              <div className="loading">Loading delegated approvals...</div>
            ) : delegationState.error ? (
              <div className="alert alert-error">{delegationState.error}</div>
            ) : delegationState.entries.length === 0 ? (
              <div className="text-muted">No delegated meal requests or approvals are currently available.</div>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Absent Worker</th>
                      <th>Approved Collector</th>
                      <th>Reason</th>
                      <th>Valid Until</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {delegationState.entries.map((entry) => (
                      <tr key={entry.id}>
                        <td>
                          {entry.absent_employee?.name || '-'}
                          <div className="text-muted">{entry.absent_employee?.badge_number || '-'}</div>
                        </td>
                        <td>
                          {entry.collector_employee?.name || '-'}
                          <div className="text-muted">{entry.collector_employee?.badge_number || '-'}</div>
                        </td>
                        <td>{entry.reason || '-'}</td>
                        <td>{entry.valid_until ? new Date(entry.valid_until).toLocaleString() : '-'}</td>
                        <td><span className={`badge ${entry.status === 'active' ? 'badge-success' : entry.status === 'requested' ? 'badge-warning' : 'badge-secondary'}`}>{entry.status}</span></td>
                        <td>
                          {entry.status === 'requested' ? (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                onClick={() => handleApproveDelegation(entry.id)}
                                disabled={delegationState.actionId === entry.id}
                              >
                                {delegationState.actionId === entry.id ? 'Approving...' : 'Approve'}
                              </button>
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                onClick={() => handleRevokeDelegation(entry.id)}
                                disabled={delegationState.actionId === entry.id}
                              >
                                Reject
                              </button>
                            </div>
                          ) : entry.status === 'active' ? (
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              onClick={() => handleRevokeDelegation(entry.id)}
                              disabled={delegationState.actionId === entry.id}
                            >
                              {delegationState.actionId === entry.id ? 'Revoking...' : 'Revoke'}
                            </button>
                          ) : 'Closed'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
