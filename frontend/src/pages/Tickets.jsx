import React, { useCallback, useEffect, useState } from 'react';
import client from '../api/client';

export default function Tickets() {
  const [tickets, setTickets] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ worker_id: '', meal_type: 'lunch', valid_date: new Date().toISOString().split('T')[0] });
  const [issuing, setIssuing] = useState(false);
  const [message, setMessage] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [ticketsRes, workersRes] = await Promise.all([
        client.get('/tickets'),
        client.get('/workers', { params: { active: 'true' } })
      ]);
      setTickets(ticketsRes.data);
      setWorkers(workersRes.data);
      setForm(f => ({ ...f, worker_id: f.worker_id || (workersRes.data[0]?.id ?? '') }));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleIssue(e) {
    e.preventDefault();
    setIssuing(true);
    setMessage('');
    try {
      const res = await client.post('/tickets/issue', {
        worker_id: parseInt(form.worker_id),
        meal_type: form.meal_type,
        valid_date: form.valid_date
      });
      setMessage(`Ticket issued! Code: ${res.data.ticket_code}`);
      fetchData();
    } catch (err) {
      setMessage(`Error: ${err.response?.data?.error || 'Failed to issue ticket'}`);
    } finally {
      setIssuing(false);
    }
  }

  function getStatusBadge(status) {
    const map = { pending: 'badge-warning', used: 'badge-success', expired: 'badge-danger' };
    return <span className={`badge ${map[status] || 'badge-secondary'}`}>{status}</span>;
  }

  return (
    <div className="page-container">
      <h1 className="page-title">Meal Tickets</h1>

      <div className="card">
        <div className="card-title">Issue Ticket</div>
        {message && <div className={`alert ${message.startsWith('Error') ? 'alert-error' : 'alert-success'}`}>{message}</div>}
        <form onSubmit={handleIssue}>
          <div className="form-row">
            <div className="form-group">
              <label>Worker</label>
              <select className="form-control" value={form.worker_id} onChange={e => setForm({...form, worker_id: e.target.value})} required>
                <option value="">Select worker</option>
                {workers.map(w => (
                  <option key={w.id} value={w.id}>{w.name} ({w.employee_id})</option>
                ))}
              </select>
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
              <label>Valid Date</label>
              <input type="date" className="form-control" value={form.valid_date} onChange={e => setForm({...form, valid_date: e.target.value})} required />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={issuing}>
            {issuing ? 'Issuing...' : 'Issue Ticket'}
          </button>
        </form>
      </div>

      <div className="card">
        <div className="card-title">Recent Tickets</div>
        {loading ? (
          <div className="loading">Loading tickets...</div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Ticket Code</th>
                  <th>Worker</th>
                  <th>Meal Type</th>
                  <th>Valid Date</th>
                  <th>Status</th>
                  <th>Issued At</th>
                </tr>
              </thead>
              <tbody>
                {tickets.length === 0 ? (
                  <tr><td colSpan={6} className="text-center text-muted" style={{ padding: '20px' }}>No tickets found</td></tr>
                ) : tickets.map(t => (
                  <tr key={t.id}>
                    <td><code style={{ fontSize: '0.75rem' }}>{t.ticket_code}</code></td>
                    <td>{t.worker_name} <span className="text-muted">({t.employee_id})</span></td>
                    <td><span className="badge badge-info">{t.meal_type}</span></td>
                    <td>{t.valid_date}</td>
                    <td>{getStatusBadge(t.status)}</td>
                    <td>{new Date(t.issued_at).toLocaleString()}</td>
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
