import React, { useCallback, useEffect, useState } from 'react';
import client from '../api/client';

export default function VendorInterface() {
  const [badgeNumber, setBadgeNumber] = useState('');
  const [mealType, setMealType] = useState('lunch');
  const [result, setResult] = useState(null);
  const [validation, setValidation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState([]);

  const fetchTransactions = useCallback(async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await client.get('/tickets/history', { params: { date: today } });
      setTransactions(res.data || []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  async function handleValidate(e) {
    e.preventDefault();
    if (!badgeNumber.trim()) return;
    setLoading(true);
    setValidation(null);
    setResult(null);
    try {
      const res = await client.get(`/tickets/validate/${encodeURIComponent(badgeNumber.trim())}`, {
        params: { meal_type: mealType }
      });
      setValidation(res.data);
    } catch (err) {
      setValidation({ error: err.response?.data?.error || 'Validation failed' });
    } finally {
      setLoading(false);
    }
  }

  async function handleRedeem(e) {
    e.preventDefault();
    if (!badgeNumber.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await client.post('/tickets/consume', {
        badge_number: badgeNumber.trim(),
        meal_type: mealType,
        canteen_location: 'Main Canteen'
      });
      setResult({ success: true, data: res.data });
      setBadgeNumber('');
      setValidation(null);
      fetchTransactions();
    } catch (err) {
      setResult({ success: false, error: err.response?.data?.error || 'Redemption failed' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-container">
      <h1 className="page-title">Vendor Interface</h1>

      <div className="card">
        <div className="vendor-redeem-box">
          <h2 style={{ marginBottom: '8px' }}>Validate and Redeem</h2>
          <p className="text-muted mb-3">Enter worker badge number and meal type</p>
          <form onSubmit={handleValidate}>
            <input
              className="form-control"
              value={badgeNumber}
              onChange={e => setBadgeNumber(e.target.value)}
              placeholder="Enter badge number..."
              style={{ maxWidth: '500px', width: '100%', fontSize: '1rem', marginBottom: '12px', display: 'block', margin: '0 auto 12px' }}
            />
            <select
              className="form-control"
              value={mealType}
              onChange={e => setMealType(e.target.value)}
              style={{ maxWidth: '500px', width: '100%', margin: '0 auto 12px' }}
            >
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
            </select>
            <button
              type="submit"
              className="btn btn-secondary"
              disabled={loading || !badgeNumber.trim()}
              style={{ padding: '10px 32px', fontSize: '1rem', marginTop: '8px' }}
            >
              {loading ? 'Validating...' : 'Validate'}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleRedeem}
              disabled={loading || !badgeNumber.trim()}
              style={{ padding: '10px 32px', fontSize: '1rem', marginTop: '8px', marginLeft: '10px' }}
            >
              {loading ? 'Redeeming...' : 'Redeem'}
            </button>
          </form>

          {validation && (
            <div className={`vendor-result ${validation.error ? 'error' : validation.can_consume ? 'success' : 'error'}`} style={{ maxWidth: '500px', margin: '20px auto 0' }}>
              {validation.error ? (
                <p>{validation.error}</p>
              ) : (
                <>
                  <p><strong>Worker:</strong> {validation.employee?.name} ({validation.employee?.employee_number})</p>
                  <p><strong>Meal Type:</strong> {validation.meal_type}</p>
                  <p><strong>Status:</strong> {validation.can_consume ? 'Eligible' : 'Already consumed'}</p>
                </>
              )}
            </div>
          )}

          {result && (
            <div className={`vendor-result ${result.success ? 'success' : 'error'}`} style={{ maxWidth: '500px', margin: '20px auto 0' }}>
              {result.success ? (
                <>
                  <h3 style={{ color: '#155724', marginBottom: '8px' }}>Meal Recorded Successfully</h3>
                  <p><strong>Worker:</strong> {result.data.employee?.name} ({result.data.employee?.employee_number})</p>
                  <p><strong>Department:</strong> {result.data.employee?.department}</p>
                  <p><strong>Meal Type:</strong> {result.data.record?.meal_type}</p>
                  <p><strong>Record ID:</strong> #{result.data.record?.id}</p>
                </>
              ) : (
                <>
                  <h3 style={{ color: '#721c24', marginBottom: '8px' }}>Redemption Failed</h3>
                  <p>{result.error}</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Today's Meal Records</div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Worker</th>
                <th>Meal Type</th>
                <th>Badge</th>
                <th>Consumed At</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-muted" style={{ padding: '20px' }}>No transactions today</td></tr>
              ) : transactions.map(t => (
                <tr key={t.id}>
                  <td>{t.id}</td>
                  <td>{t.employee_name || '-'} <span className="text-muted">({t.employee_number || '-'})</span></td>
                  <td><span className="badge badge-info">{t.meal_type}</span></td>
                  <td><code style={{ fontSize: '0.75rem' }}>{t.badge_number || '-'}</code></td>
                  <td>{new Date(t.consumed_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
