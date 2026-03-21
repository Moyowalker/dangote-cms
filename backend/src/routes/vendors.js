const express = require('express');
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// POST /api/vendors/redeem
router.post('/redeem', authenticate, authorize('vendor', 'admin'), (req, res) => {
  const { ticket_code, notes } = req.body;
  if (!ticket_code) {
    return res.status(400).json({ error: 'ticket_code is required' });
  }

  const ticket = db.prepare('SELECT * FROM meal_tickets WHERE ticket_code = ?').get(ticket_code);
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket not found' });
  }
  if (ticket.status !== 'pending') {
    return res.status(400).json({ error: `Ticket is already ${ticket.status}` });
  }

  const today = new Date().toISOString().split('T')[0];
  if (ticket.valid_date !== today) {
    return res.status(400).json({ error: `Ticket is not valid for today. Valid date: ${ticket.valid_date}` });
  }

  // Mark ticket as used and create transaction
  const redeemTransaction = db.transaction(() => {
    db.prepare('UPDATE meal_tickets SET status = ? WHERE id = ?').run('used', ticket.id);
    const result = db.prepare(
      'INSERT INTO transactions (ticket_id, vendor_user_id, notes) VALUES (?, ?, ?)'
    ).run(ticket.id, req.user.id, notes || null);
    return result.lastInsertRowid;
  });

  const transactionId = redeemTransaction();
  const worker = db.prepare('SELECT name, employee_id, department FROM workers WHERE id = ?').get(ticket.worker_id);

  res.json({
    message: 'Ticket redeemed successfully',
    transaction_id: transactionId,
    ticket: { ...ticket, status: 'used' },
    worker
  });
});

// GET /api/vendors/transactions - today's transactions for this vendor
router.get('/transactions', authenticate, authorize('vendor', 'admin'), (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const transactions = db.prepare(`
    SELECT t.*, mt.ticket_code, mt.meal_type, mt.valid_date,
           w.name as worker_name, w.employee_id
    FROM transactions t
    JOIN meal_tickets mt ON t.ticket_id = mt.id
    JOIN workers w ON mt.worker_id = w.id
    WHERE t.vendor_user_id = ? AND DATE(t.redeemed_at) = ?
    ORDER BY t.redeemed_at DESC
  `).all(req.user.id, today);
  res.json(transactions);
});

module.exports = router;
