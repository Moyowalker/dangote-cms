const express = require('express');
const { getDb } = require('../database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/validate/:badge_number', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const { badge_number } = req.params;
    const { meal_type, date } = req.query;
    
    const employee = db.prepare('SELECT * FROM employees WHERE badge_number = ? AND active = 1').get(badge_number);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    const checkDate = date || new Date().toISOString().split('T')[0];
    const checkMealType = meal_type || 'lunch';
    
    const existing = db.prepare(
      'SELECT * FROM meal_records WHERE employee_id = ? AND meal_type = ? AND consumption_date = ?'
    ).get(employee.id, checkMealType, checkDate);
    
    res.json({
      employee,
      can_consume: !existing,
      already_consumed: !!existing,
      meal_type: checkMealType,
      date: checkDate
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/consume', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const { badge_number, meal_type, canteen_location, notes } = req.body;
    
    if (!badge_number || !meal_type) {
      return res.status(400).json({ error: 'badge_number and meal_type are required' });
    }
    
    const employee = db.prepare('SELECT * FROM employees WHERE badge_number = ? AND active = 1').get(badge_number);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    const today = new Date().toISOString().split('T')[0];
    
    try {
      const result = db.prepare(
        'INSERT INTO meal_records (employee_id, meal_type, consumption_date, staff_id, canteen_location, notes) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(employee.id, meal_type, today, req.session.user.id, canteen_location || 'Main Canteen', notes || null);
      
      const record = db.prepare('SELECT * FROM meal_records WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json({ message: 'Meal recorded successfully', record, employee });
    } catch (insertErr) {
      if (insertErr.message.includes('UNIQUE')) {
        return res.status(409).json({ error: 'Meal already recorded for this employee today' });
      }
      throw insertErr;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/history', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const { employee_id, date, meal_type } = req.query;
    let query = `
      SELECT mr.*, e.name as employee_name, e.employee_number, e.badge_number
      FROM meal_records mr
      JOIN employees e ON e.id = mr.employee_id
      WHERE 1=1
    `;
    const params = [];
    if (employee_id) {
      query += ' AND mr.employee_id = ?';
      params.push(employee_id);
    }
    if (date) {
      query += ' AND mr.consumption_date = ?';
      params.push(date);
    }
    if (meal_type) {
      query += ' AND mr.meal_type = ?';
      params.push(meal_type);
    }
    query += ' ORDER BY mr.consumed_at DESC';
    const records = db.prepare(query).all(...params);
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
