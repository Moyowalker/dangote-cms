import React, { useCallback, useEffect, useMemo, useState } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { isReportViewerRole } from '../auth/roles';
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

function formatReviewerLabel(batch) {
  if (!batch?.reviewed_at) {
    return 'Not reviewed yet';
  }

  return `Reviewed ${formatDateTime(batch.reviewed_at)}`;
}

export default function OfflineActivity() {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [localBatches, setLocalBatches] = useState([]);
  const [serverBatches, setServerBatches] = useState([]);
  const [selectedLocalBatchId, setSelectedLocalBatchId] = useState('');
  const [selectedServerBatchId, setSelectedServerBatchId] = useState('');
  const [selectedServerBatch, setSelectedServerBatch] = useState(null);
  const [serverDetailLoading, setServerDetailLoading] = useState(false);
  const [reviewStatus, setReviewStatus] = useState('reconciled');
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const deviceProfile = getOfflineDeviceProfile();
  const canReview = isReportViewerRole(user?.role);

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
      const nextServerBatches = normalizeServerBatches(response.data);
      setServerBatches(nextServerBatches);
      setSelectedServerBatchId((currentId) => (
        nextServerBatches.some((batch) => batch.id === currentId)
          ? currentId
          : (nextServerBatches[0]?.id || '')
      ));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load server reconciliation history for this device date.');
      setServerBatches([]);
      setSelectedServerBatchId('');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchServerBatchDetail = useCallback(async (batchId) => {
    if (!batchId) {
      setSelectedServerBatch(null);
      setReviewNotes('');
      return;
    }

    setServerDetailLoading(true);
    setError('');

    try {
      const response = await client.get(`/reconciliation/offline-batches/${batchId}`);
      const nextBatch = response.data || null;
      setSelectedServerBatch(nextBatch);
      setReviewStatus(nextBatch?.status || 'reconciled');
      setReviewNotes(nextBatch?.review_notes || '');
    } catch (err) {
      setSelectedServerBatch(null);
      setError(err.response?.data?.error || 'Failed to load server batch detail.');
    } finally {
      setServerDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshLocalHistory(selectedDate);
    fetchServerBatches(selectedDate);
  }, [fetchServerBatches, refreshLocalHistory, selectedDate]);

  useEffect(() => {
    fetchServerBatchDetail(selectedServerBatchId);
  }, [fetchServerBatchDetail, selectedServerBatchId]);

  const selectedLocalBatch = localBatches.find((batch) => batch.id === selectedLocalBatchId) || null;
  const localNeedsFollowUp = localBatches.filter((batch) => batch.status !== 'reconciled' || batch.upload_status !== 'uploaded').length;
  const serverNeedsReview = serverBatches.filter((batch) => batch.status !== 'reconciled').length;
  const serverSummary = useMemo(() => selectedServerBatch?.summary || null, [selectedServerBatch]);

  async function handleSubmitReview(event) {
    event.preventDefault();
    if (!selectedServerBatchId || !canReview) {
      return;
    }

    setReviewSaving(true);
    setError('');

    try {
      const response = await client.patch(`/reconciliation/offline-batches/${selectedServerBatchId}/review`, {
        status: reviewStatus,
        review_notes: reviewNotes
      });
      const updatedBatch = response.data || null;
      setSelectedServerBatch(updatedBatch);
      setReviewStatus(updatedBatch?.status || reviewStatus);
      setReviewNotes(updatedBatch?.review_notes || '');
      setServerBatches((currentBatches) => currentBatches.map((batch) => (
        batch.id === updatedBatch?.id ? { ...batch, ...updatedBatch } : batch
      )));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update review status for this batch.');
    } finally {
      setReviewSaving(false);
    }
  }

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
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {serverBatches.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center text-muted" style={{ padding: '20px' }}>
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
                      <td>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => setSelectedServerBatchId(batch.id)}
                        >
                          {selectedServerBatchId === batch.id ? 'Viewing' : 'View Detail'}
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
          <div className="card-title">Selected Server Batch</div>
          {!selectedServerBatchId ? (
            <div className="text-muted">Select a server batch to inspect the authoritative reconciliation items.</div>
          ) : serverDetailLoading ? (
            <div className="loading">Loading server batch detail...</div>
          ) : !selectedServerBatch ? (
            <div className="text-muted">Server batch detail is unavailable for the current selection.</div>
          ) : (
            <>
              <div className="offline-activity-detail-grid">
                <div className="indicator-chip-row">
                  <div className="indicator-chip"><strong>Status:</strong> {selectedServerBatch.status}</div>
                  <div className="indicator-chip"><strong>Uploaded:</strong> {formatDateTime(selectedServerBatch.created_at)}</div>
                  <div className="indicator-chip"><strong>Review:</strong> {formatReviewerLabel(selectedServerBatch)}</div>
                </div>
                {selectedServerBatch.review_notes ? (
                  <div className="alert alert-info">{selectedServerBatch.review_notes}</div>
                ) : null}
              </div>

              {serverSummary ? (
                <div className="stats-grid compact offline-activity-stats-grid">
                  <div className="stat-card info">
                    <div className="stat-value">{serverSummary.total_entries ?? 0}</div>
                    <div className="stat-label">Entries</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{serverSummary.matched_entries ?? 0}</div>
                    <div className="stat-label">Matched</div>
                  </div>
                  <div className="stat-card warning">
                    <div className="stat-value">{serverSummary.unresolved_entries ?? 0}</div>
                    <div className="stat-label">Unresolved</div>
                  </div>
                  <div className="stat-card danger">
                    <div className="stat-value">{serverSummary.missing_transaction_links ?? 0}</div>
                    <div className="stat-label">Missing Links</div>
                  </div>
                </div>
              ) : null}

              {canReview ? (
                <form className="offline-activity-review-form" onSubmit={handleSubmitReview}>
                  <div className="form-row offline-activity-review-grid">
                    <div className="form-group">
                      <label htmlFor="offline-review-status">Review Status</label>
                      <select
                        id="offline-review-status"
                        className="form-control"
                        value={reviewStatus}
                        onChange={(event) => setReviewStatus(event.target.value)}
                        disabled={reviewSaving}
                      >
                        <option value="reconciled">Reconciled</option>
                        <option value="needs_review">Needs Review</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </div>
                    <div className="form-group offline-activity-review-notes">
                      <label htmlFor="offline-review-notes">Review Notes</label>
                      <textarea
                        id="offline-review-notes"
                        className="form-control"
                        rows={3}
                        value={reviewNotes}
                        onChange={(event) => setReviewNotes(event.target.value)}
                        disabled={reviewSaving}
                        placeholder="Add operator follow-up notes for this batch..."
                      />
                    </div>
                  </div>
                  <div className="filters-actions">
                    <button type="submit" className="btn btn-primary" disabled={reviewSaving}>
                      {reviewSaving ? 'Saving Review...' : 'Save Review'}
                    </button>
                  </div>
                </form>
              ) : null}

              <div className="table-container" style={{ marginTop: '16px' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Worker</th>
                      <th>Badge</th>
                      <th>Meal</th>
                      <th>Queue Ref</th>
                      <th>Status</th>
                      <th>Resolution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedServerBatch.entries || []).length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center text-muted" style={{ padding: '20px' }}>
                          No authoritative item detail is available for this server batch.
                        </td>
                      </tr>
                    ) : (selectedServerBatch.entries || []).map((entry, index) => (
                      <tr key={`${selectedServerBatch.id}-${entry.local_reference || index}`}>
                        <td>{entry.employee_name || 'Unknown worker'} {entry.employee_number ? `(${entry.employee_number})` : ''}</td>
                        <td>{entry.badge_number || '-'}</td>
                        <td>{entry.meal_type || '-'}</td>
                        <td>{entry.local_reference || '-'}</td>
                        <td>{entry.status || '-'}</td>
                        <td>{entry.resolution_reason || entry.client_error || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}