import React, { useCallback, useEffect, useState } from 'react';
import client from '../api/client';

function buildInitialFilters() {
  return {
    date: new Date().toISOString().split('T')[0],
    scope: '',
    action: '',
    entityType: '',
    outcome: '',
    actorRole: ''
  };
}

function buildAuditParams(filters) {
  return {
    date: filters.date,
    ...(filters.scope === 'delegation' ? { delegation_only: 'true' } : {}),
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.entityType ? { entity_type: filters.entityType } : {}),
    ...(filters.outcome ? { outcome: filters.outcome } : {}),
    ...(filters.actorRole ? { actor_role: filters.actorRole } : {})
  };
}

function formatDateTime(value) {
  if (!value) {
    return 'Unknown time';
  }

  return new Date(value).toLocaleString();
}

function badgeClassForOutcome(outcome) {
  return outcome === 'failure' ? 'badge-danger' : 'badge-success';
}

function hasDelegationContext(entry) {
  const metadata = entry?.metadata || {};

  return entry?.entity_type === 'delegated_meal_approval'
    || String(entry?.action || '').startsWith('ticket.delegation.')
    || metadata.issuance_channel === 'delegated_helpdesk'
    || Boolean(metadata.delegation_approval_id)
    || Boolean(metadata.collector_employee_id)
    || Boolean(metadata.collector_badge_number)
    || Boolean(metadata.absent_employee_id);
}

function buildDelegationContext(entry) {
  const metadata = entry?.metadata || {};

  return {
    approvalId: metadata.delegation_approval_id || (entry?.entity_type === 'delegated_meal_approval' ? entry?.entity_id : null),
    absentEmployeeId: metadata.absent_employee_id || null,
    collectorEmployeeId: metadata.collector_employee_id || null,
    collectorBadgeNumber: metadata.collector_badge_number || null,
    issuanceChannel: metadata.issuance_channel || null,
    delegationReason: metadata.delegation_reason || null,
    revokeNote: metadata.note || null
  };
}

function renderAuditJson(value) {
  if (!value || typeof value !== 'object') {
    return value == null ? '-' : String(value);
  }

  return JSON.stringify(value, null, 2);
}

export default function AuditTrail() {
  const [filters, setFilters] = useState(buildInitialFilters);
  const [appliedFilters, setAppliedFilters] = useState(buildInitialFilters);
  const [auditData, setAuditData] = useState({ total: 0, summary: { total: 0, successes: 0, failures: 0 }, entries: [] });
  const [selectedAuditId, setSelectedAuditId] = useState('');
  const [selectedAuditEntry, setSelectedAuditEntry] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchAuditLogs = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await client.get('/reports/audit', {
        params: buildAuditParams(appliedFilters)
      });
      setAuditData({
        total: response.data?.total || 0,
        summary: response.data?.summary || { total: 0, successes: 0, failures: 0 },
        entries: Array.isArray(response.data?.entries) ? response.data.entries : []
      });
      const nextEntries = Array.isArray(response.data?.entries) ? response.data.entries : [];
      setSelectedAuditId((currentId) => (
        nextEntries.some((entry) => entry.id === currentId)
          ? currentId
          : (nextEntries[0]?.id || '')
      ));
    } catch (err) {
      setAuditData({ total: 0, summary: { total: 0, successes: 0, failures: 0 }, entries: [] });
      setSelectedAuditId('');
      setSelectedAuditEntry(null);
      setError(err.response?.data?.error || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [appliedFilters]);

  useEffect(() => {
    fetchAuditLogs();
  }, [fetchAuditLogs]);

  const fetchAuditDetail = useCallback(async () => {
    if (!selectedAuditId) {
      setSelectedAuditEntry(null);
      return;
    }

    setDetailLoading(true);

    try {
      const response = await client.get(`/reports/audit/${selectedAuditId}`);
      setSelectedAuditEntry(response.data || null);
    } catch (err) {
      setSelectedAuditEntry(null);
      setError(err.response?.data?.error || 'Failed to load audit entry detail');
    } finally {
      setDetailLoading(false);
    }
  }, [selectedAuditId]);

  useEffect(() => {
    fetchAuditDetail();
  }, [fetchAuditDetail]);

  function handleFilterChange(event) {
    const { name, value } = event.target;
    setFilters((current) => ({
      ...current,
      [name]: value
    }));
  }

  function handleApplyFilters(event) {
    event.preventDefault();
    setAppliedFilters(filters);
  }

  function handleResetFilters() {
    const initialFilters = buildInitialFilters();
    setFilters(initialFilters);
    setAppliedFilters(initialFilters);
  }

  return (
    <div className="pg-wrap">
      <div className="pg-header">
        <div className="pg-header-inner">
          <div>
            <h1 className="pg-title">Audit Trail</h1>
            <p className="pg-subtitle">Review system-wide operational actions with immutable audit history.</p>
          </div>
        </div>
      </div>
      <div className="pg-body">
        <div className="card">
          <div className="card-title">Audit Filters</div>
          <form onSubmit={handleApplyFilters}>
            <div className="filter-grid">
              <div className="form-group">
                <label htmlFor="audit-date">Date</label>
                <input id="audit-date" name="date" type="date" className="form-control" value={filters.date} onChange={handleFilterChange} />
              </div>
              <div className="form-group">
                <label htmlFor="audit-scope">Scope</label>
                <select id="audit-scope" name="scope" className="form-control" value={filters.scope} onChange={handleFilterChange}>
                  <option value="">All activity</option>
                  <option value="delegation">Delegation activity</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="audit-action">Action</label>
                <input id="audit-action" name="action" className="form-control" placeholder="employee.create" value={filters.action} onChange={handleFilterChange} />
              </div>
              <div className="form-group">
                <label htmlFor="audit-entity">Entity Type</label>
                <input id="audit-entity" name="entityType" className="form-control" placeholder="employee" value={filters.entityType} onChange={handleFilterChange} />
              </div>
              <div className="form-group">
                <label htmlFor="audit-outcome">Outcome</label>
                <select id="audit-outcome" name="outcome" className="form-control" value={filters.outcome} onChange={handleFilterChange}>
                  <option value="">All outcomes</option>
                  <option value="success">Success</option>
                  <option value="failure">Failure</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="audit-actor-role">Actor Role</label>
                <select id="audit-actor-role" name="actorRole" className="form-control" value={filters.actorRole} onChange={handleFilterChange}>
                  <option value="">All roles</option>
                  <option value="admin">Admin</option>
                  <option value="viewer">Viewer</option>
                  <option value="hr">HR</option>
                  <option value="vendor">Vendor</option>
                  <option value="employee">Employee</option>
                </select>
              </div>
            </div>
            <div className="filters-actions">
              <button type="button" className="btn btn-secondary" onClick={handleResetFilters}>Reset</button>
              <button type="submit" className="btn btn-primary">Apply Filters</button>
            </div>
          </form>
        </div>

        {error ? <div className="alert alert-error">{error}</div> : null}

        <div className="stats-grid compact">
          <div className="stat-card info">
            <div className="stat-value">{auditData.summary.total}</div>
            <div className="stat-label">Audit Entries</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{auditData.summary.successes}</div>
            <div className="stat-label">Successful Actions</div>
          </div>
          <div className="stat-card danger">
            <div className="stat-value">{auditData.summary.failures}</div>
            <div className="stat-label">Failed Actions</div>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Audit Entries</div>
          {loading ? (
            <div className="loading">Loading audit logs...</div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Outcome</th>
                    <th>Delegation</th>
                    <th>Reason</th>
                    <th>Request ID</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {auditData.entries.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center text-muted" style={{ padding: '20px' }}>
                        No audit entries match these filters.
                      </td>
                    </tr>
                  ) : auditData.entries.map((entry) => (
                    <tr key={entry.id || `${entry.created_at}-${entry.action}`}>
                      <td>{formatDateTime(entry.created_at)}</td>
                      <td>{entry.actor_role || 'anonymous'} {entry.actor_user_id ? `(${entry.actor_user_id})` : ''}</td>
                      <td>{entry.action}</td>
                      <td>{entry.entity_type}{entry.entity_id ? ` (${entry.entity_id})` : ''}</td>
                      <td>
                        <span className={`badge ${badgeClassForOutcome(entry.outcome)}`}>
                          {entry.outcome}
                        </span>
                      </td>
                      <td>{hasDelegationContext(entry) ? <span className="badge badge-info">Delegation</span> : '-'}</td>
                      <td>{entry.reason || '-'}</td>
                      <td>{entry.metadata?.request_id || '-'}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => setSelectedAuditId(entry.id)}
                        >
                          {selectedAuditId === entry.id ? 'Viewing' : 'View'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">Selected Audit Entry</div>
          {!selectedAuditId ? (
            <div className="text-muted">Select an audit row to inspect the sanitized request metadata and immutable hash chain.</div>
          ) : detailLoading ? (
            <div className="loading">Loading audit entry detail...</div>
          ) : !selectedAuditEntry ? (
            <div className="text-muted">Audit entry detail is unavailable for the current selection.</div>
          ) : (
            <>
              {hasDelegationContext(selectedAuditEntry) ? (
                <div className="card" style={{ boxShadow: 'none', padding: 0, marginBottom: '16px' }}>
                  <div className="card-title">Delegation Context</div>
                  <div className="indicator-chip-row">
                    {buildDelegationContext(selectedAuditEntry).approvalId ? (
                      <div className="indicator-chip"><strong>Approval:</strong> {buildDelegationContext(selectedAuditEntry).approvalId}</div>
                    ) : null}
                    {buildDelegationContext(selectedAuditEntry).collectorBadgeNumber ? (
                      <div className="indicator-chip"><strong>Collector Badge:</strong> {buildDelegationContext(selectedAuditEntry).collectorBadgeNumber}</div>
                    ) : null}
                    {buildDelegationContext(selectedAuditEntry).issuanceChannel ? (
                      <div className="indicator-chip"><strong>Channel:</strong> {buildDelegationContext(selectedAuditEntry).issuanceChannel}</div>
                    ) : null}
                  </div>
                  <div className="table-container" style={{ marginTop: '16px' }}>
                    <table>
                      <tbody>
                        <tr>
                          <th>Absent Worker ID</th>
                          <td>{buildDelegationContext(selectedAuditEntry).absentEmployeeId || '-'}</td>
                        </tr>
                        <tr>
                          <th>Collector Employee ID</th>
                          <td>{buildDelegationContext(selectedAuditEntry).collectorEmployeeId || '-'}</td>
                        </tr>
                        <tr>
                          <th>Delegation Reason</th>
                          <td>{buildDelegationContext(selectedAuditEntry).delegationReason || '-'}</td>
                        </tr>
                        <tr>
                          <th>Review Note</th>
                          <td>{buildDelegationContext(selectedAuditEntry).revokeNote || '-'}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
              <div className="indicator-chip-row">
                <div className="indicator-chip"><strong>Action:</strong> {selectedAuditEntry.action}</div>
                <div className="indicator-chip"><strong>Entity:</strong> {selectedAuditEntry.entity_type}</div>
                <div className="indicator-chip"><strong>Outcome:</strong> {selectedAuditEntry.outcome}</div>
                <div className="indicator-chip"><strong>Hash:</strong> {selectedAuditEntry.hash}</div>
              </div>
              <div className="table-container" style={{ marginTop: '16px' }}>
                <table>
                  <tbody>
                    <tr>
                      <th>Created</th>
                      <td>{formatDateTime(selectedAuditEntry.created_at)}</td>
                    </tr>
                    <tr>
                      <th>Actor</th>
                      <td>{selectedAuditEntry.actor_role || 'anonymous'} {selectedAuditEntry.actor_user_id ? `(${selectedAuditEntry.actor_user_id})` : ''}</td>
                    </tr>
                    <tr>
                      <th>Entity ID</th>
                      <td>{selectedAuditEntry.entity_id || '-'}</td>
                    </tr>
                    <tr>
                      <th>Reason</th>
                      <td>{selectedAuditEntry.reason || '-'}</td>
                    </tr>
                    <tr>
                      <th>Previous Hash</th>
                      <td>{selectedAuditEntry.prev_hash || '-'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="card" style={{ boxShadow: 'none', padding: 0, marginTop: '16px', marginBottom: 0 }}>
                <div className="card-title">Sanitized Metadata</div>
                <pre className="audit-trail-json-block">{renderAuditJson(selectedAuditEntry.metadata)}</pre>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}