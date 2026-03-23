import React, { useEffect, useState } from 'react';
import WorkerQrCard from '../components/WorkerQrCard';
import client from '../api/client';

const MEAL_TYPE_LABELS = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner'
};

function mealStatusLabel(status) {
  if (status === 'consumed') return 'Redeemed';
  if (status === 'eligible') return 'Available';
  if (status === 'exhausted') return 'Exhausted';
  if (status === 'not_in_plan') return 'Not In Plan';
  return 'Unavailable';
}

function mealStatusClass(status) {
  if (status === 'consumed') return 'badge-info';
  if (status === 'eligible') return 'badge-success';
  return 'badge-danger';
}

function formatDateTime(value) {
  if (!value) {
    return 'No activity yet';
  }

  return new Date(value).toLocaleString();
}

export default function WorkerQrPage() {
  const [portal, setPortal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    let cancelled = false;

    async function loadPortal() {
      try {
        const response = await client.get('/tickets/self-service-summary');
        if (!cancelled) {
          setPortal(response.data);
          setError('');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.error || 'Unable to load your worker portal.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    loadPortal();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRefreshPortal() {
    setRefreshing(true);
    try {
      const response = await client.get('/tickets/self-service-summary');
      setPortal(response.data);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to refresh your worker portal.');
    } finally {
      setRefreshing(false);
    }
  }

  async function handlePasswordChange(event) {
    event.preventDefault();
    setPasswordMessage({ type: '', text: '' });

    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'Fill in your current password and the new password fields.' });
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      setPasswordMessage({ type: 'error', text: 'New password must be at least 8 characters long.' });
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'New password and confirmation do not match.' });
      return;
    }

    setPasswordSaving(true);
    try {
      const response = await client.post('/auth/change-password', {
        current_password: passwordForm.currentPassword,
        new_password: passwordForm.newPassword
      });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordMessage({ type: 'success', text: response.data?.message || 'Password changed successfully' });
    } catch (err) {
      setPasswordMessage({ type: 'error', text: err.response?.data?.error || 'Unable to change password right now.' });
    } finally {
      setPasswordSaving(false);
    }
  }

  const worker = portal?.employee || null;
  const mealStatuses = portal?.meal_statuses || [];
  const recentActivity = portal?.recent_activity || [];
  const stats = portal?.stats || {};
  const qrAvailable = worker?.active !== false && worker?.status !== 'suspended' && worker?.status !== 'deactivated';

  return (
    <div className="pg-wrap">
      <div className="pg-header">
        <div className="pg-header-inner">
          <div>
            <h1 className="pg-title">My Meal Portal</h1>
            <p className="pg-subtitle">View your QR, meal status, recent activity, and worker profile in one place.</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={handleRefreshPortal} disabled={loading || refreshing}>
            {refreshing ? 'Refreshing...' : 'Refresh Portal'}
          </button>
        </div>
      </div>
      <div className="pg-body">
        {loading ? <div className="card"><div className="loading">Loading your worker portal...</div></div> : null}
        {error ? <div className="alert alert-error">{error}</div> : null}

        {worker ? (
          <>
            <div className="worker-portal-metrics">
              <div className="stat-card info">
                <div className="stat-value">{stats.consumed_today ?? 0}</div>
                <div className="stat-label">Meals Redeemed Today</div>
              </div>
              <div className="stat-card warning">
                <div className="stat-value">{stats.remaining_today ?? 0}</div>
                <div className="stat-label">Remaining Today</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.next_eligible_meal ? MEAL_TYPE_LABELS[stats.next_eligible_meal] : 'None'}</div>
                <div className="stat-label">Next Eligible Meal</div>
              </div>
              <div className={`stat-card ${worker.active === false ? 'danger' : 'success'}`}>
                <div className="stat-value">{worker.status || (worker.active === false ? 'deactivated' : 'active')}</div>
                <div className="stat-label">Account Status</div>
              </div>
            </div>

            <div className="worker-portal-grid">
              <div className="card worker-qr-page-card">
                <div className="card-title">Live Worker QR</div>
                <div className="worker-qr-page-intro">
                  <p>Keep this screen open while approaching the serving point. The QR rotates before expiry and becomes invalid after a successful meal redemption.</p>
                  <p>This page is for live on-screen presentation only. Portable copies and token text are intentionally hidden to reduce fraud and token sharing.</p>
                </div>

                {qrAvailable ? (
                  <WorkerQrCard
                    worker={worker}
                    autoRefresh
                    showToken={false}
                    allowPortableActions={false}
                    allowManualRefresh={false}
                  />
                ) : (
                  <div className="alert alert-warning">
                    Your QR is unavailable because this worker profile is currently {worker.status || 'inactive'}. Please contact operations if this is unexpected.
                  </div>
                )}
              </div>

              <div className="card worker-portal-profile-card">
                <div className="card-title">My Profile</div>
                {worker.photo_data_url ? (
                  <div className="worker-portal-photo-wrap">
                    <img src={worker.photo_data_url} alt={`Profile for ${worker.name}`} className="worker-portal-photo" />
                  </div>
                ) : null}
                <div className="worker-portal-profile-list">
                  <div><strong>Name:</strong> {worker.name}</div>
                  <div><strong>Employee Number:</strong> {worker.employee_number}</div>
                  <div><strong>Badge Number:</strong> {worker.badge_number}</div>
                  <div><strong>Department:</strong> {worker.department || '-'}</div>
                  <div><strong>Meal Plan:</strong> {worker.meal_plan_name || 'Not assigned'}</div>
                  <div><strong>Category:</strong> {worker.worker_category_name || 'Not assigned'}</div>
                  <div><strong>Last Activity:</strong> {formatDateTime(stats.last_activity_at)}</div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-title">Today's Meal Status</div>
              <div className="worker-portal-status-grid">
                {mealStatuses.map((entry) => (
                  <div key={entry.meal_type} className="worker-portal-status-card">
                    <div className="worker-portal-status-header">
                      <strong>{MEAL_TYPE_LABELS[entry.meal_type] || entry.meal_type}</strong>
                      <span className={`badge ${mealStatusClass(entry.status)}`}>{mealStatusLabel(entry.status)}</span>
                    </div>
                    <p>{entry.message}</p>
                    <div className="worker-portal-status-meta">
                      <span>Allowed: {entry.allowed}</span>
                      <span>Consumed: {entry.consumed}</span>
                      <span>Remaining: {entry.remaining}</span>
                    </div>
                    {entry.consumed_at ? <div className="worker-portal-status-time">Redeemed at {formatDateTime(entry.consumed_at)}</div> : null}
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="card-title">Recent Activity</div>
              {recentActivity.length === 0 ? (
                <div className="text-muted">No meal activity has been recorded for this worker yet.</div>
              ) : (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Meal</th>
                        <th>Status</th>
                        <th>Location</th>
                        <th>Consumed At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentActivity.map((record) => (
                        <tr key={record.id}>
                          <td>{MEAL_TYPE_LABELS[record.meal_type] || record.meal_type}</td>
                          <td><span className="badge badge-info">{record.status}</span></td>
                          <td>{record.canteen_location || '-'}</td>
                          <td>{formatDateTime(record.consumed_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card worker-password-card">
              <div className="card-title">Password & Access</div>
              <p className="worker-password-copy">
                Replace the temporary password issued by admin with one that only you know. If you forget it later, you can recover access from the login page with your username, employee number, badge number, and the last 4 digits of your phone number.
              </p>

              {passwordMessage.text ? (
                <div className={`alert ${passwordMessage.type === 'success' ? 'alert-success' : 'alert-error'}`}>
                  {passwordMessage.text}
                </div>
              ) : null}

              <form className="worker-password-form" onSubmit={handlePasswordChange}>
                <div className="form-group">
                  <label htmlFor="worker-current-password">Current Password</label>
                  <input
                    id="worker-current-password"
                    type="password"
                    className="form-control"
                    value={passwordForm.currentPassword}
                    onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))}
                    autoComplete="current-password"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="worker-new-password">New Password</label>
                  <input
                    id="worker-new-password"
                    type="password"
                    className="form-control"
                    value={passwordForm.newPassword}
                    onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
                    autoComplete="new-password"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="worker-confirm-password">Confirm New Password</label>
                  <input
                    id="worker-confirm-password"
                    type="password"
                    className="form-control"
                    value={passwordForm.confirmPassword}
                    onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                    autoComplete="new-password"
                  />
                </div>
                <div className="flex gap-2 mt-3">
                  <button type="submit" className="btn btn-primary" disabled={passwordSaving}>
                    {passwordSaving ? 'Updating...' : 'Change Password'}
                  </button>
                </div>
              </form>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}