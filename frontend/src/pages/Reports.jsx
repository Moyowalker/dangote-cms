import React, { useCallback, useEffect, useState } from 'react';
import client from '../api/client';

export default function Reports() {
  const [summary, setSummary] = useState(null);
  const [dailyDate, setDailyDate] = useState(new Date().toISOString().split('T')[0]);
  const [dailyData, setDailyData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    client.get('/reports/summary').then(res => setSummary(res.data)).catch(() => {});
  }, []);

  const fetchDaily = useCallback(async () => {
    setLoading(true);
    try {
      const res = await client.get(`/reports/daily?date=${dailyDate}`);
      setDailyData(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [dailyDate]);

  useEffect(() => { fetchDaily(); }, [fetchDaily]);

  function getMealCount(mealType, status) {
    if (!dailyData?.counts) return 0;
    const entry = dailyData.counts.find(c => c.meal_type === mealType && c.status === status);
    return entry?.count || 0;
  }

  return (
    <div className="page-container">
      <h1 className="page-title">Reports</h1>

      {summary && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{summary.total_workers}</div>
            <div className="stat-label">Active Workers</div>
          </div>
          <div className="stat-card" style={{ borderLeftColor: '#007bff' }}>
            <div className="stat-value" style={{ color: '#007bff' }}>{summary.tickets_issued_today}</div>
            <div className="stat-label">Issued Today</div>
          </div>
          <div className="stat-card" style={{ borderLeftColor: '#28a745' }}>
            <div className="stat-value" style={{ color: '#28a745' }}>{summary.tickets_redeemed_today}</div>
            <div className="stat-label">Redeemed Today</div>
          </div>
          <div className="stat-card" style={{ borderLeftColor: '#ffc107' }}>
            <div className="stat-value" style={{ color: '#ffc107' }}>{summary.tickets_pending_today}</div>
            <div className="stat-label">Pending Today</div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="flex-between mb-3">
          <div className="card-title">Daily Report</div>
          <input
            type="date"
            className="form-control"
            style={{ width: 'auto' }}
            value={dailyDate}
            onChange={e => setDailyDate(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="loading">Loading...</div>
        ) : dailyData ? (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Meal Type</th>
                  <th>Issued</th>
                  <th>Redeemed</th>
                  <th>Pending</th>
                  <th>Expired</th>
                </tr>
              </thead>
              <tbody>
                {['breakfast', 'lunch', 'dinner'].map(meal => {
                  const issued = getMealCount(meal, 'pending') + getMealCount(meal, 'used') + getMealCount(meal, 'expired');
                  return (
                    <tr key={meal}>
                      <td><span className="badge badge-info" style={{ textTransform: 'capitalize' }}>{meal}</span></td>
                      <td>{issued}</td>
                      <td><span className="badge badge-success">{getMealCount(meal, 'used')}</span></td>
                      <td><span className="badge badge-warning">{getMealCount(meal, 'pending')}</span></td>
                      <td><span className="badge badge-danger">{getMealCount(meal, 'expired')}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
