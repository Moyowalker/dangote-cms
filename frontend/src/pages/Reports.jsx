import React, { useCallback, useEffect, useState } from 'react';
import client from '../api/client';

export default function Reports() {
  const [dailyDate, setDailyDate] = useState(new Date().toISOString().split('T')[0]);
  const [dailyData, setDailyData] = useState(null);
  const [departmentData, setDepartmentData] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchDaily = useCallback(async () => {
    setLoading(true);
    try {
      const [dailyRes, deptRes] = await Promise.all([
        client.get(`/reports/daily?date=${dailyDate}`),
        client.get('/reports/department', { params: { date: dailyDate } })
      ]);
      setDailyData(dailyRes.data);
      setDepartmentData(deptRes.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [dailyDate]);

  useEffect(() => { fetchDaily(); }, [fetchDaily]);

  function getMealCount(mealType) {
    if (!dailyData?.summary) return 0;
    const entry = dailyData.summary.find(c => c.meal_type === mealType);
    return entry?.count || 0;
  }

  return (
    <div className="page-container">
      <h1 className="page-title">Reports</h1>

      {dailyData && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{dailyData.total || 0}</div>
            <div className="stat-label">Total Meals</div>
          </div>
          <div className="stat-card" style={{ borderLeftColor: '#007bff' }}>
            <div className="stat-value" style={{ color: '#007bff' }}>{getMealCount('breakfast')}</div>
            <div className="stat-label">Breakfast</div>
          </div>
          <div className="stat-card" style={{ borderLeftColor: '#28a745' }}>
            <div className="stat-value" style={{ color: '#28a745' }}>{getMealCount('lunch')}</div>
            <div className="stat-label">Lunch</div>
          </div>
          <div className="stat-card" style={{ borderLeftColor: '#ffc107' }}>
            <div className="stat-value" style={{ color: '#ffc107' }}>{getMealCount('dinner')}</div>
            <div className="stat-label">Dinner</div>
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
                  <th>Count</th>
                </tr>
              </thead>
              <tbody>
                {['breakfast', 'lunch', 'dinner'].map(meal => {
                  return (
                    <tr key={meal}>
                      <td><span className="badge badge-info" style={{ textTransform: 'capitalize' }}>{meal}</span></td>
                      <td>{getMealCount(meal)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div className="card">
        <div className="card-title">Department Breakdown</div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Department</th>
                <th>Meal Type</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {departmentData.length === 0 ? (
                <tr><td colSpan={3} className="text-center text-muted" style={{ padding: '20px' }}>No department data</td></tr>
              ) : departmentData.map((d, idx) => (
                <tr key={`${d.department}-${d.meal_type}-${idx}`}>
                  <td>{d.department}</td>
                  <td style={{ textTransform: 'capitalize' }}>{d.meal_type}</td>
                  <td>{d.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
