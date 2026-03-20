import React, { useEffect, useState } from 'react';
import client from '../api/client';

export default function VendorInterface() {
  const [ticketCode, setTicketCode] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState([]);

  async function fetchTransactions() {
    try {
      const res = await client.get('/vendors/transactions');
      setTransactions(res.data);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => { fetchTransactions(); }, []);

  async function handleRedeem(e) {
    e.preventDefault();
    if (!ticketCode.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await client.post('/vendors/redeem', { ticket_code: ticketCode.trim() });
      setResult({ success: true, data: res.data });
      setTicketCode('');
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
          <h2 style={{ marginBottom: '8px' }}>Redeem Meal Ticket</h2>
          <p className="text-muted mb-3">Enter the ticket code to redeem a meal</p>
          <form onSubmit={handleRedeem}>
            <input
              className="form-control"
              value={ticketCode}
              onChange={e => setTicketCode(e.target.value)}
              placeholder="Enter ticket code..."
              style={{ maxWidth: '500px', width: '100%', fontSize: '1rem', marginBottom: '12px', display: 'block', margin: '0 auto 12px' }}
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !ticketCode.trim()}
              style={{ padding: '10px 32px', fontSize: '1rem', marginTop: '8px' }}
            >
              {loading ? 'Redeeming...' : 'Redeem Ticket'}
            </button>
          </form>

          {result && (
            <div className={`vendor-result ${result.success ? 'success' : 'error'}`} style={{ maxWidth: '500px', margin: '20px auto 0' }}>
              {result.success ? (
                <>
                  <h3 style={{ color: '#155724', marginBottom: '8px' }}>Ticket Redeemed Successfully!</h3>
                  <p><strong>Worker:</strong> {result.data.worker?.name} ({result.data.worker?.employee_id})</p>
                  <p><strong>Department:</strong> {result.data.worker?.department}</p>
                  <p><strong>Meal Type:</strong> {result.data.ticket?.meal_type}</p>
                  <p><strong>Transaction ID:</strong> #{result.data.transaction_id}</p>
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
        <div className="card-title">Today's Transactions</div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Worker</th>
                <th>Meal Type</th>
                <th>Ticket Code</th>
                <th>Redeemed At</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-muted" style={{ padding: '20px' }}>No transactions today</td></tr>
              ) : transactions.map(t => (
                <tr key={t.id}>
                  <td>{t.id}</td>
                  <td>{t.worker_name} <span className="text-muted">({t.employee_id})</span></td>
                  <td><span className="badge badge-info">{t.meal_type}</span></td>
                  <td><code style={{ fontSize: '0.75rem' }}>{t.ticket_code}</code></td>
                  <td>{new Date(t.redeemed_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
