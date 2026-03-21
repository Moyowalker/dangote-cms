const express = require('express');
const db = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication and admin/hr role
router.use(authenticate, authorize('admin', 'hr'));

// GET /api/workers
router.get('/', (req, res) => {
  const { department, active } = req.query;
  let query = 'SELECT * FROM workers WHERE 1=1';
  const params = [];
  if (department) {
    query += ' AND department = ?';
    params.push(department);
  }
  if (active !== undefined) {
    query += ' AND active = ?';
    params.push(active === 'true' ? 1 : 0);
  }
  query += ' ORDER BY name ASC';
  const workers = db.prepare(query).all(...params);
  res.json(workers);
});

// POST /api/workers
router.post('/', (req, res) => {
  const { employee_id, name, department, meal_plan } = req.body;
  if (!employee_id || !name || !department || !meal_plan) {
    return res.status(400).json({ error: 'employee_id, name, department, and meal_plan are required' });
  }
  const validMealPlans = ['breakfast', 'lunch', 'dinner', 'all'];
  if (!validMealPlans.includes(meal_plan)) {
    return res.status(400).json({ error: 'Invalid meal_plan. Must be breakfast, lunch, dinner, or all' });
  }
  try {
    const result = db.prepare(
      'INSERT INTO workers (employee_id, name, department, meal_plan) VALUES (?, ?, ?, ?)'
    ).run(employee_id, name, department, meal_plan);
    const worker = db.prepare('SELECT * FROM workers WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(worker);
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Employee ID already exists' });
    }
    throw err;
  }
});

// GET /api/workers/:id
router.get('/:id', (req, res) => {
  const worker = db.prepare('SELECT * FROM workers WHERE id = ?').get(req.params.id);
  if (!worker) return res.status(404).json({ error: 'Worker not found' });
  res.json(worker);
});

// PUT /api/workers/:id
router.put('/:id', (req, res) => {
  const worker = db.prepare('SELECT * FROM workers WHERE id = ?').get(req.params.id);
  if (!worker) return res.status(404).json({ error: 'Worker not found' });

  const { name, department, meal_plan, active } = req.body;
  const updatedName = name !== undefined ? name : worker.name;
  const updatedDept = department !== undefined ? department : worker.department;
  const updatedPlan = meal_plan !== undefined ? meal_plan : worker.meal_plan;
  const updatedActive = active !== undefined ? (active ? 1 : 0) : worker.active;

  if (meal_plan) {
    const validMealPlans = ['breakfast', 'lunch', 'dinner', 'all'];
    if (!validMealPlans.includes(meal_plan)) {
      return res.status(400).json({ error: 'Invalid meal_plan' });
    }
  }

  db.prepare(
    'UPDATE workers SET name = ?, department = ?, meal_plan = ?, active = ? WHERE id = ?'
  ).run(updatedName, updatedDept, updatedPlan, updatedActive, req.params.id);

  const updated = db.prepare('SELECT * FROM workers WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// DELETE /api/workers/:id - soft delete
router.delete('/:id', (req, res) => {
  const worker = db.prepare('SELECT * FROM workers WHERE id = ?').get(req.params.id);
  if (!worker) return res.status(404).json({ error: 'Worker not found' });
  db.prepare('UPDATE workers SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Worker deactivated successfully' });
});

module.exports = router;
