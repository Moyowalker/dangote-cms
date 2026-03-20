const express = require('express');
const { getDb } = require('../database');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/daily', requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const summary = db.prepare(`
      SELECT meal_type, COUNT(*) as count
      FROM meal_records
      WHERE consumption_date = ?
      GROUP BY meal_type
    `).all(date);
    const details = db.prepare(`
      SELECT mr.*, e.name as employee_name, e.department, e.employee_number
      FROM meal_records mr
      JOIN employees e ON e.id = mr.employee_id
      WHERE mr.consumption_date = ?
      ORDER BY mr.meal_type, e.name
    `).all(date);
    res.json({ date, summary, details, total: details.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/department', requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const { date, month } = req.query;
    let whereClause = '1=1';
    const params = [];
    if (date) {
      whereClause = 'mr.consumption_date = ?';
      params.push(date);
    } else if (month) {
      whereClause = "strftime('%Y-%m', mr.consumption_date) = ?";
      params.push(month);
    }
    const data = db.prepare(`
      SELECT e.department, mr.meal_type, COUNT(*) as count
      FROM meal_records mr
      JOIN employees e ON e.id = mr.employee_id
      WHERE ${whereClause}
      GROUP BY e.department, mr.meal_type
      ORDER BY e.department, mr.meal_type
    `).all(...params);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/employee/:id', requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const records = db.prepare(`
      SELECT * FROM meal_records
      WHERE employee_id = ?
      ORDER BY consumption_date DESC, meal_type
    `).all(req.params.id);
    res.json({ employee, records, total: records.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
