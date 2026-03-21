import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';

export default function Dashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.role === 'admin') {
      client.get('/dashboard/stats')
        .then(res => setSummary(res.data))
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
          ) : null}

          <div className="card">
            <div className="card-title">Quick Actions</div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link to="/workers" className="btn btn-primary">👥 Manage Workers</Link>
              <Link to="/tickets" className="btn btn-primary">🎫 Issue Tickets</Link>
              <Link to="/reports" className="btn btn-secondary">📊 View Reports</Link>
            </div>
          </div>
        </>
      )}

      {user?.role === 'staff' && (
        <div className="card">
          <div className="card-title">Staff Actions</div>
          <p className="mb-3">Use ticket and vendor tools to validate and record meal consumption.</p>
          <Link to="/vendor" className="btn btn-primary">🍽️ Go to Vendor Interface</Link>
        </div>
      )}
    </div>
  );
}
