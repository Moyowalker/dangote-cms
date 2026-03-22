import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';
import { isVendorRole } from '../auth/roles';

function sortIndicatorEntries(entriesObject) {
  return Object.entries(entriesObject || {}).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
}

function healthCardClass(status) {
  if (status === 'critical') return 'danger';
  if (status === 'warning') return 'warning';
  return 'info';
}

function healthLabel(operationName) {
  if (operationName === 'ticket.consume') return 'Consume';
  if (operationName === 'ticket.validate') return 'Validate';
  return operationName;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [indicators, setIndicators] = useState(null);
  const [loading, setLoading] = useState(true);

  const failureReasons = sortIndicatorEntries(indicators?.risk_indicators?.failed_attempts_by_reason);
  const failedAttemptsByLocation = sortIndicatorEntries(indicators?.operational_indicators?.failed_attempts_by_location);
  const endpointHealth = Object.entries(indicators?.operational_indicators?.ticket_endpoint_health || {});

  useEffect(() => {
    if (user?.role === 'admin') {
      Promise.all([
        client.get('/dashboard/stats'),
        client.get('/dashboard/indicators')
      ])
        .then(([statsRes, indicatorsRes]) => {
          setSummary(statsRes.data);
          setIndicators(indicatorsRes.data);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [user]);

  return (
    <div className="page-container">
      <div className="flex-between mb-3">
        <h1 className="page-title">Dashboard</h1>
        <span className="text-muted">Welcome, <strong>{user?.username}</strong></span>
      </div>

      {user?.role === 'admin' && (
        <>
          {loading ? (
            <div className="loading">Loading stats...</div>
          ) : summary ? (
            <>
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-value">{summary.totalEmployees}</div>
                  <div className="stat-label">Active Workers</div>
                </div>
                <div className="stat-card" style={{ borderLeftColor: '#007bff' }}>
                  <div className="stat-value" style={{ color: '#007bff' }}>{summary.mealsToday}</div>
                  <div className="stat-label">Meals Today</div>
                </div>
                <div className="stat-card" style={{ borderLeftColor: '#28a745' }}>
                  <div className="stat-value" style={{ color: '#28a745' }}>{summary.mealsThisMonth}</div>
                  <div className="stat-label">Meals This Month</div>
                </div>
                <div className="stat-card" style={{ borderLeftColor: '#ffc107' }}>
                  <div className="stat-value" style={{ color: '#ffc107' }}>{summary.activePlans}</div>
                  <div className="stat-label">Active Meal Plans</div>
                </div>
              </div>

              {indicators && (
                <div className="card">
                  <div className="card-title">Operational Indicators</div>
                  <div className="stats-grid compact">
                    <div className="stat-card warning">
                      <div className="stat-value">{indicators.risk_indicators?.failed_attempts_today ?? 0}</div>
                      <div className="stat-label">Failed Attempts Today</div>
                    </div>
                    <div className="stat-card danger">
                      <div className="stat-value">{indicators.risk_indicators?.duplicate_window_blocks_today ?? 0}</div>
                      <div className="stat-label">Duplicate Blocks Today</div>
                    </div>
                    <div className="stat-card info">
                      <div className="stat-value">{indicators.operational_indicators?.redemptions_today ?? 0}</div>
                      <div className="stat-label">Confirmed Redemptions Today</div>
                    </div>
                  </div>

                  <div className="indicator-location-list">
                    <div className="indicator-subtitle">Redemptions By Location</div>
                    {Object.entries(indicators.operational_indicators?.redemptions_by_location || {}).length === 0 ? (
                      <div className="text-muted">No location activity recorded yet.</div>
                    ) : (
                      <div className="indicator-chip-row">
                        {Object.entries(indicators.operational_indicators?.redemptions_by_location || {}).map(([location, count]) => (
                          <div key={location} className="indicator-chip">
                            <span>{location}</span>
                            <strong>{count}</strong>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="indicator-grid">
                    <div className="indicator-panel">
                      <div className="indicator-subtitle">Latency And Stall Visibility</div>
                      {endpointHealth.length === 0 ? (
                        <div className="text-muted">No endpoint timing data recorded yet.</div>
                      ) : (
                        <div className="indicator-stat-grid">
                          {endpointHealth.map(([operationName, metric]) => (
                            <div key={operationName} className={`stat-card ${healthCardClass(metric.health_status)}`}>
                              <div className="stat-value">{metric.p95_ms}ms</div>
                              <div className="stat-label">{healthLabel(operationName)} P95</div>
                              <div className="stat-meta">
                                Avg {metric.average_ms}ms | Slow {metric.slow_requests} | Active {metric.active_requests} | Stalled {metric.stalled_requests}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="indicator-panel">
                      <div className="indicator-subtitle">Failure Reasons Today</div>
                      {failureReasons.length === 0 ? (
                        <div className="text-muted">No failure reasons recorded yet.</div>
                      ) : (
                        <div className="indicator-chip-row">
                          {failureReasons.map(([reason, count]) => (
                            <div key={reason} className="indicator-chip indicator-chip-alert">
                              <span>{reason}</span>
                              <strong>{count}</strong>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="indicator-panel">
                      <div className="indicator-subtitle">Failed Attempts By Location</div>
                      {failedAttemptsByLocation.length === 0 ? (
                        <div className="text-muted">No failed-attempt hotspots recorded yet.</div>
                      ) : (
                        <div className="indicator-chip-row">
                          {failedAttemptsByLocation.map(([location, count]) => (
                            <div key={location} className="indicator-chip indicator-chip-alert">
                              <span>{location}</span>
                              <strong>{count}</strong>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : null}

          <div className="card">
            <div className="card-title">Quick Actions</div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link to="/workers" className="btn btn-primary">👥 Manage Workers</Link>
              <Link to="/tickets" className="btn btn-primary">🎫 Issue Tickets</Link>
              <Link to="/reports" className="btn btn-secondary">📊 View Reports</Link>
              <Link to="/reconciliation" className="btn btn-secondary">⚖️ Reconciliation</Link>
            </div>
          </div>
        </>
      )}

      {user?.role !== 'admin' && isVendorRole(user?.role) && (
        <div className="card">
          <div className="card-title">Vendor Actions</div>
          <p className="mb-3">Use ticket and vendor tools to validate and record meal consumption.</p>
          <Link to="/vendor" className="btn btn-primary">🍽️ Go to Vendor Interface</Link>
        </div>
      )}
    </div>
  );
}
