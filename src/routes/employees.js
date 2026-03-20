const express = require('express');
const { getDb } = require('../database');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const { search, department } = req.query;
    let query = 'SELECT e.*, mp.name as meal_plan_name FROM employees e LEFT JOIN meal_plans mp ON mp.id = e.meal_plan_id WHERE 1=1';
    const params = [];
    if (search) {
      query += ' AND (e.name LIKE ? OR e.employee_number LIKE ? OR e.email LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (department) {
      query += ' AND e.department = ?';
      params.push(department);
    }
    query += ' ORDER BY e.name';
    const employees = db.prepare(query).all(...params);
    res.json(employees);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const { employee_number, name, department, email, phone, badge_number, meal_plan_id } = req.body;
    if (!employee_number || !name || !department || !badge_number) {
      return res.status(400).json({ error: 'employee_number, name, department, and badge_number are required' });
    }
    const result = db.prepare(
      'INSERT INTO employees (employee_number, name, department, email, phone, badge_number, meal_plan_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(employee_number, name, department, email || null, phone || null, badge_number, meal_plan_id || null);
    const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(employee);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Employee number, email, or badge number already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const employee = db.prepare('SELECT e.*, mp.name as meal_plan_name FROM employees e LEFT JOIN meal_plans mp ON mp.id = e.meal_plan_id WHERE e.id = ?').get(req.params.id);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    res.json(employee);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const { employee_number, name, department, email, phone, badge_number, meal_plan_id, active } = req.body;
    const existing = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    db.prepare(
      'UPDATE employees SET employee_number=?, name=?, department=?, email=?, phone=?, badge_number=?, meal_plan_id=?, active=? WHERE id=?'
    ).run(
      employee_number ?? existing.employee_number,
      name ?? existing.name,
      department ?? existing.department,
      email ?? existing.email,
      phone ?? existing.phone,
      badge_number ?? existing.badge_number,
      meal_plan_id ?? existing.meal_plan_id,
      active ?? existing.active,
      req.params.id
    );
    const updated = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Employee number, email, or badge number already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    db.prepare('DELETE FROM employees WHERE id = ?').run(req.params.id);
    res.json({ message: 'Employee deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
