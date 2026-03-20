const express = require('express');
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate, authorize('admin', 'hr'));

// GET /api/reports/daily?date=YYYY-MM-DD
router.get('/daily', (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  const counts = db.prepare(`
    SELECT meal_type, status, COUNT(*) as count
    FROM meal_tickets
    WHERE valid_date = ?
    GROUP BY meal_type, status
  `).all(date);
  res.json({ date, counts });
});

// GET /api/reports/worker/:workerId
router.get('/worker/:workerId', (req, res) => {
  const worker = db.prepare('SELECT * FROM workers WHERE id = ?').get(req.params.workerId);
  if (!worker) return res.status(404).json({ error: 'Worker not found' });

  const tickets = db.prepare(`
    SELECT mt.*, u.username as issued_by_username
    FROM meal_tickets mt
    JOIN users u ON mt.issued_by = u.id
    WHERE mt.worker_id = ?
    ORDER BY mt.issued_at DESC
  `).all(req.params.workerId);

  res.json({ worker, tickets });
});

// GET /api/reports/summary
router.get('/summary', (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  const totalWorkers = db.prepare('SELECT COUNT(*) as count FROM workers WHERE active = 1').get();
  const issuedToday = db.prepare('SELECT COUNT(*) as count FROM meal_tickets WHERE valid_date = ?').get(today);
  const redeemedToday = db.prepare("SELECT COUNT(*) as count FROM meal_tickets WHERE valid_date = ? AND status = 'used'").get(today);
  const pendingToday = db.prepare("SELECT COUNT(*) as count FROM meal_tickets WHERE valid_date = ? AND status = 'pending'").get(today);

  res.json({
    total_workers: totalWorkers.count,
    tickets_issued_today: issuedToday.count,
    tickets_redeemed_today: redeemedToday.count,
    tickets_pending_today: pendingToday.count,
    date: today
  });
});

module.exports = router;
