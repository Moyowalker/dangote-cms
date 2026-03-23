import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';
import { EMPLOYEE_ROLE, isVendorRole } from '../auth/roles';

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

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function Dashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [indicators, setIndicators] = useState(null);
  const [loading, setLoading] = useState(true);

  if (user?.role === EMPLOYEE_ROLE) {
    return <Navigate to="/my-portal" replace />;
  }

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

  const dateString = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  return (
    <div className="dash-page">
      {/* ── Hero Banner ── */}
      <div className="dash-hero">
        <div className="dash-hero-inner">
          <div>
            <h1 className="dash-hero-title">
              {getGreeting()}, <span>{user?.username}</span>
            </h1>
            <p className="dash-hero-sub">
              Here&#39;s what&#39;s happening with your canteen operations today.
            </p>
          </div>
          <div className="dash-hero-date">{dateString}</div>
        </div>
      </div>

      <div className="dash-content">
        {user?.role === 'admin' && (
          <>
            {loading ? (
              <div className="dash-loading">
                <div className="dash-spinner" />
                <span>Loading stats...</span>
              </div>
            ) : summary ? (
              <>
                {/* ── Key Metrics ── */}
                <div className="dash-stats">
                  <div className="dash-stat-card" style={{ '--accent': '#1a6b3a' }}>
                    <div className="dash-stat-icon-wrap" style={{ background: '#e8f5ee', color: '#1a6b3a' }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    </div>
                    <div className="dash-stat-body">
                      <span className="dash-stat-value">{summary.totalEmployees}</span>
                      <span className="dash-stat-label">Active Workers</span>
                    </div>
                  </div>

                  <div className="dash-stat-card" style={{ '--accent': '#2563eb' }}>
                    <div className="dash-stat-icon-wrap" style={{ background: '#eff6ff', color: '#2563eb' }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>
                    </div>
                    <div className="dash-stat-body">
                      <span className="dash-stat-value">{summary.mealsToday}</span>
                      <span className="dash-stat-label">Meals Today</span>
                    </div>
                  </div>

                  <div className="dash-stat-card" style={{ '--accent': '#7c3aed' }}>
                    <div className="dash-stat-icon-wrap" style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    </div>
                    <div className="dash-stat-body">
                      <span className="dash-stat-value">{summary.mealsThisMonth}</span>
                      <span className="dash-stat-label">Meals This Month</span>
                    </div>
                  </div>

                  <div className="dash-stat-card" style={{ '--accent': '#d97706' }}>
                    <div className="dash-stat-icon-wrap" style={{ background: '#fffbeb', color: '#d97706' }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                    </div>
                    <div className="dash-stat-body">
                      <span className="dash-stat-value">{summary.activePlans}</span>
                      <span className="dash-stat-label">Active Meal Plans</span>
                    </div>
                  </div>
                </div>

                {/* ── Operational Indicators ── */}
                {indicators && (
                  <section className="dash-section">
                    <h2 className="dash-section-title">
                      <span className="dash-section-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                      </span>
                      Operational Indicators
                    </h2>

                    <div className="dash-kpi-row">
                      <div className="dash-kpi-card warning">
                        <div className="dash-kpi-value">{indicators.risk_indicators?.failed_attempts_today ?? 0}</div>
                        <div className="dash-kpi-label">Failed Attempts Today</div>
                        <div className="dash-kpi-bar"><div className="fill" style={{ width: Math.min((indicators.risk_indicators?.failed_attempts_today ?? 0) * 10, 100) + '%' }} /></div>
                      </div>
                      <div className="dash-kpi-card danger">
                        <div className="dash-kpi-value">{indicators.risk_indicators?.duplicate_window_blocks_today ?? 0}</div>
                        <div className="dash-kpi-label">Duplicate Blocks Today</div>
                        <div className="dash-kpi-bar"><div className="fill" style={{ width: Math.min((indicators.risk_indicators?.duplicate_window_blocks_today ?? 0) * 10, 100) + '%' }} /></div>
                      </div>
                      <div className="dash-kpi-card success">
                        <div className="dash-kpi-value">{indicators.operational_indicators?.redemptions_today ?? 0}</div>
                        <div className="dash-kpi-label">Confirmed Redemptions Today</div>
                        <div className="dash-kpi-bar"><div className="fill" style={{ width: Math.min((indicators.operational_indicators?.redemptions_today ?? 0) / 2, 100) + '%' }} /></div>
                      </div>
                    </div>

                    {/* Redemptions By Location */}
                    <div className="dash-panel">
                      <h3 className="dash-panel-title">Redemptions By Location</h3>
                      {Object.entries(indicators.operational_indicators?.redemptions_by_location || {}).length === 0 ? (
                        <div className="dash-empty">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
                          <span>No location activity recorded yet.</span>
                        </div>
                      ) : (
                        <div className="dash-chips">
                          {Object.entries(indicators.operational_indicators?.redemptions_by_location || {}).map(([location, count]) => (
                            <div key={location} className="dash-chip">
                              <span className="dash-chip-dot success" />
                              <span>{location}</span>
                              <strong>{count}</strong>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Detail Panels */}
                    <div className="dash-panels-grid">
                      <div className="dash-panel">
                        <h3 className="dash-panel-title">Latency And Stall Visibility</h3>
                        {endpointHealth.length === 0 ? (
                          <div className="dash-empty">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
                            <span>No endpoint timing data recorded yet.</span>
                          </div>
                        ) : (
                          <div className="dash-health-grid">
                            {endpointHealth.map(([opName, metric]) => (
                              <div key={opName} className={`dash-health-card ${healthCardClass(metric.health_status)}`}>
                                <div className="dash-health-value">{metric.p95_ms}ms</div>
                                <div className="dash-health-label">{healthLabel(opName)} P95</div>
                                <div className="dash-health-meta">
                                  Avg {metric.average_ms}ms | Slow {metric.slow_requests} | Active {metric.active_requests} | Stalled {metric.stalled_requests}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="dash-panel">
                        <h3 className="dash-panel-title">Failure Reasons Today</h3>
                        {failureReasons.length === 0 ? (
                          <div className="dash-empty">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
                            <span>No failure reasons recorded yet.</span>
                          </div>
                        ) : (
                          <div className="dash-chips">
                            {failureReasons.map(([reason, count]) => (
                              <div key={reason} className="dash-chip alert">
                                <span className="dash-chip-dot danger" />
                                <span>{reason}</span>
                                <strong>{count}</strong>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="dash-panel">
                        <h3 className="dash-panel-title">Failed Attempts By Location</h3>
                        {failedAttemptsByLocation.length === 0 ? (
                          <div className="dash-empty">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
                            <span>No failed-attempt hotspots recorded yet.</span>
                          </div>
                        ) : (
                          <div className="dash-chips">
                            {failedAttemptsByLocation.map(([location, count]) => (
                              <div key={location} className="dash-chip alert">
                                <span className="dash-chip-dot danger" />
                                <span>{location}</span>
                                <strong>{count}</strong>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </section>
                )}
              </>
            ) : null}

            {/* ── Quick Actions ── */}
            <section className="dash-section">
              <h2 className="dash-section-title">
                <span className="dash-section-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                </span>
                Quick Actions
              </h2>
              <div className="dash-actions">
                <Link to="/workers" className="dash-action-card">
                  <div className="dash-action-icon" style={{ background: '#e8f5ee', color: '#1a6b3a' }}>👥</div>
                  <div className="dash-action-body">
                    <strong>Manage Workers</strong>
                    <span>Add, edit, and manage employee records</span>
                  </div>
                  <svg className="dash-action-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                </Link>
                <Link to="/tickets" className="dash-action-card">
                  <div className="dash-action-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>🎫</div>
                  <div className="dash-action-body">
                    <strong>Issue Tickets</strong>
                    <span>Generate and manage meal tickets</span>
                  </div>
                  <svg className="dash-action-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                </Link>
                <Link to="/reports" className="dash-action-card">
                  <div className="dash-action-icon" style={{ background: '#f5f3ff', color: '#7c3aed' }}>📊</div>
                  <div className="dash-action-body">
                    <strong>View Reports</strong>
                    <span>Analyze meal consumption and trends</span>
                  </div>
                  <svg className="dash-action-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                </Link>
                <Link to="/reconciliation" className="dash-action-card">
                  <div className="dash-action-icon" style={{ background: '#fffbeb', color: '#d97706' }}>⚖️</div>
                  <div className="dash-action-body">
                    <strong>Reconciliation</strong>
                    <span>Match transactions and resolve discrepancies</span>
                  </div>
                  <svg className="dash-action-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                </Link>
              </div>
            </section>
          </>
        )}

        {user?.role !== 'admin' && isVendorRole(user?.role) && (
          <section className="dash-section">
            <h2 className="dash-section-title">
              <span className="dash-section-icon">🍽️</span>
              Vendor Actions
            </h2>
            <div className="dash-vendor-cta">
              <p>Use ticket and vendor tools to validate and record meal consumption.</p>
              <Link to="/vendor" className="btn btn-primary btn-lg">🍽️ Go to Vendor Interface</Link>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
