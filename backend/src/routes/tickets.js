const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// POST /api/tickets/issue - admin/hr only
router.post('/issue', authenticate, authorize('admin', 'hr'), (req, res) => {
  const { worker_id, meal_type, valid_date } = req.body;
  if (!worker_id || !meal_type || !valid_date) {
    return res.status(400).json({ error: 'worker_id, meal_type, and valid_date are required' });
  }
  const validMealTypes = ['breakfast', 'lunch', 'dinner'];
  if (!validMealTypes.includes(meal_type)) {
    return res.status(400).json({ error: 'Invalid meal_type. Must be breakfast, lunch, or dinner' });
  }
  const worker = db.prepare('SELECT * FROM workers WHERE id = ? AND active = 1').get(worker_id);
  if (!worker) return res.status(404).json({ error: 'Worker not found or inactive' });

  const ticket_code = uuidv4();
  const result = db.prepare(
    'INSERT INTO meal_tickets (worker_id, ticket_code, meal_type, valid_date, issued_by) VALUES (?, ?, ?, ?, ?)'
  ).run(worker_id, ticket_code, meal_type, valid_date, req.user.id);

  const ticket = db.prepare('SELECT * FROM meal_tickets WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(ticket);
});

// POST /api/tickets/batch-issue - admin/hr only
router.post('/batch-issue', authenticate, authorize('admin', 'hr'), (req, res) => {
  const { worker_ids, meal_type, valid_date } = req.body;
  if (!worker_ids || !Array.isArray(worker_ids) || worker_ids.length === 0 || !meal_type || !valid_date) {
    return res.status(400).json({ error: 'worker_ids (array), meal_type, and valid_date are required' });
  }
  const validMealTypes = ['breakfast', 'lunch', 'dinner'];
  if (!validMealTypes.includes(meal_type)) {
    return res.status(400).json({ error: 'Invalid meal_type' });
  }

  const insertTicket = db.prepare(
    'INSERT INTO meal_tickets (worker_id, ticket_code, meal_type, valid_date, issued_by) VALUES (?, ?, ?, ?, ?)'
  );

  const tickets = [];
  const batchInsert = db.transaction(() => {
    for (const worker_id of worker_ids) {
      const worker = db.prepare('SELECT * FROM workers WHERE id = ? AND active = 1').get(worker_id);
      if (worker) {
        const ticket_code = uuidv4();
        const result = insertTicket.run(worker_id, ticket_code, meal_type, valid_date, req.user.id);
        tickets.push(db.prepare('SELECT * FROM meal_tickets WHERE id = ?').get(result.lastInsertRowid));
      }
    }
  });
  batchInsert();
  res.status(201).json({ issued: tickets.length, tickets });
});

// GET /api/tickets - list tickets
router.get('/', authenticate, (req, res) => {
  const { role, id: userId } = req.user;
  let query, params;

  if (role === 'admin' || role === 'hr') {
    query = `
      SELECT mt.*, w.name as worker_name, w.employee_id
      FROM meal_tickets mt
      JOIN workers w ON mt.worker_id = w.id
      ORDER BY mt.issued_at DESC
      LIMIT 100
    `;
    params = [];
  } else if (role === 'worker') {
    // Workers linked to user by username matching employee data - simplified: show by worker_id
    query = `
      SELECT mt.*, w.name as worker_name, w.employee_id
      FROM meal_tickets mt
      JOIN workers w ON mt.worker_id = w.id
      WHERE mt.issued_by = ?
      ORDER BY mt.issued_at DESC
    `;
    params = [userId];
  } else {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const tickets = db.prepare(query).all(...params);
  res.json(tickets);
});

// GET /api/tickets/:id
router.get('/:id', authenticate, (req, res) => {
  const ticket = db.prepare(`
    SELECT mt.*, w.name as worker_name, w.employee_id
    FROM meal_tickets mt
    JOIN workers w ON mt.worker_id = w.id
    WHERE mt.id = ?
  `).get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  res.json(ticket);
});

module.exports = router;
