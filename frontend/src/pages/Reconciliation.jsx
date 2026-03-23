import React, { useCallback, useEffect, useState } from 'react';
import client from '../api/client';

function badgeClassForIndicator(indicator) {
  if (indicator === 'high') {
    return 'badge-danger';
  }

  if (indicator === 'medium') {
    return 'badge-warning';
  }

  if (indicator === 'low') {
    return 'badge-info';
  }

  return 'badge-success';
}

function labelForFollowUpStatus(status) {
  if (status === 'confirmed-after-failure') {
    return 'Confirmed later';
  }

  if (status === 'already-confirmed-before-failure') {
    return 'Already confirmed';
  }

  return 'Needs follow-up';
}

export default function Reconciliation() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [summary, setSummary] = useState([]);
  const [selectedVendorKey, setSelectedVendorKey] = useState('');
  const [drilldown, setDrilldown] = useState(null);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const selectedRow = summary.find((row) => `${row.vendor_user_id}::${row.canteen_location}` === selectedVendorKey) || null;

  const fetchReconciliation = useCallback(async () => {
    setLoading(true);
    setError('');
    setDrilldown(null);
    try {
      const res = await client.get('/reconciliation/vendor-daily', { params: { date: selectedDate } });
      const nextSummary = Array.isArray(res.data?.summary) ? res.data.summary : [];
      setSummary(nextSummary);
      setSelectedVendorKey((currentKey) => (
        nextSummary.some((row) => `${row.vendor_user_id}::${row.canteen_location}` === currentKey)
          ? currentKey
          : (nextSummary[0] ? `${nextSummary[0].vendor_user_id}::${nextSummary[0].canteen_location}` : '')
      ));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load reconciliation summary');
      setSummary([]);
      setSelectedVendorKey('');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    fetchReconciliation();
  }, [fetchReconciliation]);

  const fetchDrilldown = useCallback(async () => {
    if (!selectedRow) {
      setDrilldown(null);
      return;
    }

    setDrilldownLoading(true);
    try {
      const res = await client.get('/reconciliation/vendor-daily/drilldown', {
        params: {
          date: selectedDate,
          vendor_user_id: selectedRow.vendor_user_id,
          canteen_location: selectedRow.canteen_location
        }
      });
      setDrilldown(res.data || null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load reconciliation drilldown');
      setDrilldown(null);
    } finally {
      setDrilldownLoading(false);
    }
  }, [selectedDate, selectedRow]);

  useEffect(() => {
    fetchDrilldown();
  }, [fetchDrilldown]);

  const totals = summary.reduce((accumulator, row) => ({
    totalConsumptions: accumulator.totalConsumptions + (row.total_consumptions || 0),
    failedAttempts: accumulator.failedAttempts + (row.failed_attempts || 0)
  }), { totalConsumptions: 0, failedAttempts: 0 });

  return (
    <div className="pg-wrap">
      <div className="pg-header">
        <div className="pg-header-inner">
          <div>
            <h1 className="pg-title">Reconciliation</h1>
            <p className="pg-subtitle">Match transactions and resolve discrepancies</p>
          </div>
          <input
            type="date"
            className="form-control pg-header-date"
            aria-label="Reconciliation date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
          />
        </div>
      </div>
      <div className="pg-body">

      {error && <div className="alert alert-error">{error}</div>}

      <div className="stats-grid compact">
        <div className="stat-card info">
          <div className="stat-value">{summary.length}</div>
          <div className="stat-label">Vendor Locations</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totals.totalConsumptions}</div>
          <div className="stat-label">Confirmed Consumptions</div>
        </div>
        <div className="stat-card danger">
          <div className="stat-value">{totals.failedAttempts}</div>
          <div className="stat-label">Failed Attempts</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Vendor Daily Summary</div>
        {loading ? (
          <div className="loading">Loading reconciliation...</div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Location</th>
                  <th>Consumptions</th>
                  <th>Failed Attempts</th>
                  <th>Indicator</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {summary.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center text-muted" style={{ padding: '20px' }}>
                      No reconciliation summary for this date
                    </td>
                  </tr>
                ) : summary.map((row) => (
                  <tr key={`${row.vendor_user_id}-${row.canteen_location}`}>
                    <td>{row.vendor_user_id}</td>
                    <td>{row.canteen_location}</td>
                    <td>{row.total_consumptions}</td>
                    <td>{row.failed_attempts}</td>
                    <td>
                      <span className={`badge ${badgeClassForIndicator(row.discrepancy_indicator)}`}>
                        {row.discrepancy_indicator}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setSelectedVendorKey(`${row.vendor_user_id}::${row.canteen_location}`)}
                      >
                        {selectedVendorKey === `${row.vendor_user_id}::${row.canteen_location}` ? 'Viewing' : 'View Details'}
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
        <div className="card-title">Reconciliation Drilldown</div>
        {!selectedRow ? (
          <div className="text-muted">Select a vendor location row to review success and failure detail.</div>
        ) : drilldownLoading ? (
          <div className="loading">Loading drilldown...</div>
        ) : drilldown ? (
          <>
            <div className="stats-grid compact">
              <div className="stat-card info">
                <div className="stat-value">{drilldown.summary?.total_consumptions ?? 0}</div>
                <div className="stat-label">Confirmed Consumptions</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{drilldown.summary?.consumptions_with_transaction ?? 0}</div>
                <div className="stat-label">With Transaction Ref</div>
              </div>
              <div className="stat-card danger">
                <div className="stat-value">{drilldown.summary?.failed_attempts ?? 0}</div>
                <div className="stat-label">Failed Attempts</div>
              </div>
              <div className="stat-card warning">
                <div className="stat-value">{drilldown.summary?.missing_transaction_links ?? 0}</div>
                <div className="stat-label">Missing Transaction Ref</div>
              </div>
              <div className="stat-card info">
                <div className="stat-value">{drilldown.summary?.failures_with_confirmed_match ?? 0}</div>
                <div className="stat-label">Matched Failures</div>
              </div>
              <div className="stat-card warning">
                <div className="stat-value">{drilldown.summary?.unresolved_failed_attempts ?? 0}</div>
                <div className="stat-label">Unresolved Failures</div>
              </div>
            </div>

            {(drilldown.summary?.missing_transaction_links ?? 0) > 0 && (
              <div className="alert alert-warning">
                Some confirmed consumptions do not have a linked transaction reference yet. Treat them as reconciliation follow-up items before signoff.
              </div>
            )}

            {(drilldown.summary?.unresolved_failed_attempts ?? 0) > 0 && (
              <div className="alert alert-warning">
                Some failed attempts still have no matched confirmed consumption. Review them before assuming the queue recovered cleanly.
              </div>
            )}

            <div className="card" style={{ boxShadow: 'none', padding: 0, marginBottom: '20px' }}>
              <div className="indicator-subtitle">Confirmed Consumption Detail</div>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Worker</th>
                      <th>Badge</th>
                      <th>Department</th>
                      <th>Meal Type</th>
                      <th>Transaction Ref</th>
                      <th>Consumed At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drilldown.successful_consumptions?.length ? drilldown.successful_consumptions.map((record) => (
                      <tr key={record.id}>
                        <td>{record.employee_name || 'Unknown worker'} ({record.employee_number || '-'})</td>
                        <td>{record.badge_number || '-'}</td>
                        <td>{record.department || '-'}</td>
                        <td>{record.meal_type}</td>
                        <td>{record.transaction_reference || 'Missing link'}</td>
                        <td>{record.consumed_at ? new Date(record.consumed_at).toLocaleString() : '-'}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={6} className="text-center text-muted" style={{ padding: '20px' }}>No confirmed consumptions for this vendor location on the selected date</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card" style={{ boxShadow: 'none', padding: 0, marginBottom: 0 }}>
              <div className="indicator-subtitle">Failed Attempt Detail</div>
              <div className="text-muted" style={{ marginBottom: '12px' }}>
                Already recorded failures: {drilldown.summary?.already_recorded_failures ?? 0} | Confirmed later: {drilldown.summary?.failures_confirmed_after_failure ?? 0}
              </div>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Reason</th>
                      <th>Badge</th>
                      <th>Meal Type</th>
                      <th>Follow-up</th>
                      <th>Matched Transaction Ref</th>
                      <th>Created At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drilldown.failed_attempts?.length ? drilldown.failed_attempts.map((record) => (
                      <tr key={record.id}>
                        <td>{record.reason}</td>
                        <td>{record.badge_number || '-'}</td>
                        <td>{record.meal_type || '-'}</td>
                        <td>{labelForFollowUpStatus(record.follow_up_status)}</td>
                        <td>{record.matched_transaction_reference || 'No confirmed match'}</td>
                        <td>{record.created_at ? new Date(record.created_at).toLocaleString() : '-'}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={6} className="text-center text-muted" style={{ padding: '20px' }}>No failed attempts for this vendor location on the selected date</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="text-muted">No drilldown data available yet.</div>
        )}
      </div>
      </div>
    </div>
  );
}