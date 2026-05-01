import React, { useCallback, useEffect, useState } from 'react';
import client from '../api/client';
import { getOfflineDeviceProfile, readOfflineActivityHistory } from '../utils/offlineVendorQueue';

function formatDateTime(value) {
  if (!value) {
    return 'Unknown time';
  }

  return new Date(value).toLocaleString();
}

function badgeClassForBatchStatus(status) {
  if (status === 'reconciled') {
    return 'badge-success';
  }

  if (status === 'rejected') {
    return 'badge-danger';
  }

  return 'badge-warning';
}

function labelForUploadStatus(uploadStatus) {
  if (uploadStatus === 'uploaded') {
    return 'Uploaded';
  }

  if (uploadStatus === 'upload_failed') {
    return 'Local only';
  }

  return 'Pending';
}

function normalizeServerBatches(payload) {
  return Array.isArray(payload?.batches) ? payload.batches : [];
}

export default function OfflineActivity() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [localBatches, setLocalBatches] = useState([]);
  const [serverBatches, setServerBatches] = useState([]);
  const [selectedLocalBatchId, setSelectedLocalBatchId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const deviceProfile = getOfflineDeviceProfile();

  const refreshLocalHistory = useCallback((date) => {
    const nextLocalBatches = readOfflineActivityHistory().filter((batch) => batch.batch_date === date);
    setLocalBatches(nextLocalBatches);
    setSelectedLocalBatchId((currentId) => (
      nextLocalBatches.some((batch) => batch.id === currentId)
        ? currentId
        : (nextLocalBatches[0]?.id || '')
    ));
  }, []);

  const fetchServerBatches = useCallback(async (date) => {
    setLoading(true);
    setError('');

    try {
      const response = await client.get('/reconciliation/offline-batches', {
        params: { date }
      });
      setServerBatches(normalizeServerBatches(response.data));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load server reconciliation history for this device date.');
      setServerBatches([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshLocalHistory(selectedDate);
    fetchServerBatches(selectedDate);
  }, [fetchServerBatches, refreshLocalHistory, selectedDate]);

  const selectedLocalBatch = localBatches.find((batch) => batch.id === selectedLocalBatchId) || null;
  const localNeedsFollowUp = localBatches.filter((batch) => batch.status !== 'reconciled' || batch.upload_status !== 'uploaded').length;
  const serverNeedsReview = serverBatches.filter((batch) => batch.status !== 'reconciled').length;

  return (
    <div className="pg-wrap">
      <div className="pg-header vendor">
        <div className="pg-header-inner offline-activity-header-row">
          <div>
            <h1 className="pg-title">Offline Activity</h1>
            <p className="pg-subtitle">Review what this device queued, synced, and uploaded for reconciliation.</p>
          </div>
          <div className="offline-activity-header-actions">
            <input
              type="date"
              className="form-control pg-header-date"
              aria-label="Offline activity date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                refreshLocalHistory(selectedDate);
                fetchServerBatches(selectedDate);
              }}
            >
              Refresh
            </button>
          </div>
        </div>
      </div>
      <div className="pg-body">
        <div className="card vendor-status-banner warning">
          <strong>Device:</strong> {deviceProfile.label} ({deviceProfile.id})
          <div className="offline-activity-banner-copy">
            Local history is kept on this device even when reconciliation upload fails. Server history is the authoritative follow-up view once a batch upload succeeds.
          </div>
        </div>

        {error ? <div className="alert alert-warning">{error}</div> : null}

        <div className="stats-grid compact">
          <div className="stat-card info">
            <div className="stat-value">{localBatches.length}</div>
            <div className="stat-label">Local Sync Batches</div>
            <div className="stat-meta">Stored on this device for {selectedDate}</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{serverBatches.length}</div>
            <div className="stat-label">Server Batches</div>
            <div className="stat-meta">Uploaded reconciliation records for the selected date</div>
          </div>
          <div className="stat-card warning">
            <div className="stat-value">{localNeedsFollowUp}</div>
            <div className="stat-label">Local Follow-up</div>
            <div className="stat-meta">Batches still pending upload or marked for review</div>
          </div>
          <div className="stat-card danger">
            <div className="stat-value">{serverNeedsReview}</div>
            <div className="stat-label">Server Needs Review</div>
            <div className="stat-meta">Authoritative batches not yet fully reconciled</div>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Local Device Activity</div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Recorded</th>
                  <th>Entries</th>
                  <th>Upload</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {localBatches.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center text-muted" style={{ padding: '20px' }}>
                      No offline device activity was recorded for this date.
                    </td>
                  </tr>
                ) : localBatches.map((batch) => (
                  <tr key={batch.id}>
                    <td>{formatDateTime(batch.recorded_at)}</td>
                    <td>{batch.summary?.total_entries ?? 0}</td>
                    <td>
                      <span className={`badge ${batch.upload_status === 'uploaded' ? 'badge-info' : 'badge-warning'}`}>
                        {labelForUploadStatus(batch.upload_status)}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${badgeClassForBatchStatus(batch.status)}`}>
                        {batch.status}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setSelectedLocalBatchId(batch.id)}
                      >
                        {selectedLocalBatchId === batch.id ? 'Viewing' : 'View Items'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Selected Device Batch</div>
          {!selectedLocalBatch ? (
            <div className="text-muted">Pick a local batch to inspect the exact queued items and retry outcomes.</div>
          ) : (
            <>
              <div className="offline-activity-detail-grid">
                <div className="indicator-chip-row">
                  <div className="indicator-chip"><strong>Location:</strong> {selectedLocalBatch.canteen_location || 'Main Canteen'}</div>
                  <div className="indicator-chip"><strong>Date:</strong> {selectedLocalBatch.batch_date}</div>
                  <div className="indicator-chip"><strong>Upload:</strong> {labelForUploadStatus(selectedLocalBatch.upload_status)}</div>
                </div>
                {selectedLocalBatch.upload_error ? (
                  <div className="alert alert-warning" style={{ marginTop: '16px' }}>
                    {selectedLocalBatch.upload_error}
                  </div>
                ) : null}
              </div>
              <div className="table-container" style={{ marginTop: '16px' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Worker</th>
                      <th>Badge</th>
                      <th>Meal</th>
                      <th>Client Outcome</th>
                      <th>Resolution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedLocalBatch.entries || []).map((entry, index) => (
                      <tr key={`${selectedLocalBatch.id}-${entry.local_reference || index}`}>
                        <td>{entry.employee_name || 'Unknown worker'} {entry.employee_number ? `(${entry.employee_number})` : ''}</td>
                        <td>{entry.badge_number || '-'}</td>
                        <td>{entry.meal_type || '-'}</td>
                        <td>{entry.client_outcome || entry.status || '-'}</td>
                        <td>{entry.resolution_reason || entry.client_error || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="card">
          <div className="card-title">Server Reconciliation History</div>
          {loading ? (
            <div className="loading">Loading reconciliation history...</div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Submitted</th>
                    <th>Device</th>
                    <th>Total</th>
                    <th>Matched</th>
                    <th>Unresolved</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {serverBatches.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center text-muted" style={{ padding: '20px' }}>
                        No server reconciliation batches were found for this date.
                      </td>
                    </tr>
                  ) : serverBatches.map((batch) => (
                    <tr key={batch.id}>
                      <td>{formatDateTime(batch.created_at || batch.recorded_at)}</td>
                      <td>{batch.device_label || batch.device_id || 'Unknown device'}</td>
                      <td>{batch.summary?.total_entries ?? 0}</td>
                      <td>{batch.summary?.matched_entries ?? 0}</td>
                      <td>{batch.summary?.unresolved_entries ?? 0}</td>
                      <td>
                        <span className={`badge ${badgeClassForBatchStatus(batch.status)}`}>
                          {batch.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}