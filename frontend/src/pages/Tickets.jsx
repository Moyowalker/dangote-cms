import React, { useCallback, useEffect, useState } from 'react';
import client from '../api/client';

export default function Tickets() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ badge_number: '', meal_type: 'lunch', canteen_location: 'Main Canteen', notes: '' });
  const [issuing, setIssuing] = useState(false);
  const [message, setMessage] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const ticketsRes = await client.get('/tickets/history');
      setTickets(ticketsRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleIssue(e) {
    e.preventDefault();
    if (!form.badge_number.trim()) return;
    setIssuing(true);
    setMessage('');
    try {
      const res = await client.post('/tickets/consume', {
        badge_number: form.badge_number.trim(),
        meal_type: form.meal_type,
        canteen_location: form.canteen_location || 'Main Canteen',
        notes: form.notes || undefined
      });
      setMessage(`Meal recorded for ${res.data.employee?.name || 'worker'}`);
      setForm({ badge_number: '', meal_type: form.meal_type, canteen_location: form.canteen_location, notes: '' });
      fetchData();
    } catch (err) {
      setMessage(`Error: ${err.response?.data?.error || 'Failed to record meal'}`);
    } finally {
      setIssuing(false);
    }
  }

  return (
    <div className="page-container">
      <h1 className="page-title">Ticket Operations</h1>

      <div className="card">
        <div className="card-title">Record Meal Consumption</div>
        {message && <div className={`alert ${message.startsWith('Error') ? 'alert-error' : 'alert-success'}`}>{message}</div>}
        <form onSubmit={handleIssue}>
          <div className="form-row">
            <div className="form-group">
              <label>Badge Number</label>
              <input className="form-control" value={form.badge_number} onChange={e => setForm({...form, badge_number: e.target.value})} placeholder="Enter worker badge number" required />
            </div>
            <div className="form-group">
              <label>Meal Type</label>
              <select className="form-control" value={form.meal_type} onChange={e => setForm({...form, meal_type: e.target.value})}>
                <option value="breakfast">Breakfast</option>
                <option value="lunch">Lunch</option>
                <option value="dinner">Dinner</option>
              </select>
            </div>
            <div className="form-group">
              <label>Canteen Location</label>
              <input className="form-control" value={form.canteen_location} onChange={e => setForm({...form, canteen_location: e.target.value})} />
            </div>
            <div className="form-group">
              <label>Notes</label>
              <input className="form-control" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={issuing}>
            {issuing ? 'Recording...' : 'Record Meal'}
          </button>
        </form>
      </div>

      <div className="card">
        <div className="card-title">Recent Meal Records</div>
        {loading ? (
          <div className="loading">Loading tickets...</div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Badge Number</th>
                  <th>Worker</th>
                  <th>Meal Type</th>
                  <th>Date</th>
                  <th>Consumed At</th>
                </tr>
              </thead>
              <tbody>
                {tickets.length === 0 ? (
                  <tr><td colSpan={5} className="text-center text-muted" style={{ padding: '20px' }}>No records found</td></tr>
                ) : tickets.map(t => (
                  <tr key={t.id}>
                    <td><code style={{ fontSize: '0.75rem' }}>{t.badge_number || '-'}</code></td>
                    <td>{t.employee_name || '-'} <span className="text-muted">({t.employee_number || '-'})</span></td>
                    <td><span className="badge badge-info">{t.meal_type}</span></td>
                    <td>{t.consumption_date}</td>
                    <td>{new Date(t.consumed_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
