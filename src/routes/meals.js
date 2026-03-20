const express = require('express');
const { getDb } = require('../database');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Meal Plans
router.get('/meal-plans', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const plans = db.prepare('SELECT * FROM meal_plans ORDER BY name').all();
    res.json(plans);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/meal-plans', requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const { name, description, breakfast, lunch, dinner } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const result = db.prepare(
      'INSERT INTO meal_plans (name, description, breakfast, lunch, dinner) VALUES (?, ?, ?, ?, ?)'
    ).run(name, description || null, breakfast ?? 1, lunch ?? 1, dinner ?? 0);
    const plan = db.prepare('SELECT * FROM meal_plans WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(plan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/meal-plans/:id', requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM meal_plans WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Meal plan not found' });
    }
    const { name, description, breakfast, lunch, dinner, active } = req.body;
    db.prepare(
      'UPDATE meal_plans SET name=?, description=?, breakfast=?, lunch=?, dinner=?, active=? WHERE id=?'
    ).run(
      name ?? existing.name,
      description ?? existing.description,
      breakfast ?? existing.breakfast,
      lunch ?? existing.lunch,
      dinner ?? existing.dinner,
      active ?? existing.active,
      req.params.id
    );
    const updated = db.prepare('SELECT * FROM meal_plans WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/meal-plans/:id', requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM meal_plans WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Meal plan not found' });
    }
    db.prepare('DELETE FROM meal_plans WHERE id = ?').run(req.params.id);
    res.json({ message: 'Meal plan deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Menu Items
router.get('/menu-items', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const { date, meal_type } = req.query;
    let query = 'SELECT * FROM menu_items WHERE 1=1';
    const params = [];
    if (date) {
      query += ' AND available_date = ?';
      params.push(date);
    }
    if (meal_type) {
      query += ' AND meal_type = ?';
      params.push(meal_type);
    }
    query += ' ORDER BY available_date DESC, meal_type';
    const items = db.prepare(query).all(...params);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/menu-items', requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const { name, description, meal_type, price, available_date } = req.body;
    if (!name || !meal_type || !available_date) {
      return res.status(400).json({ error: 'name, meal_type, and available_date are required' });
    }
    const result = db.prepare(
      'INSERT INTO menu_items (name, description, meal_type, price, available_date) VALUES (?, ?, ?, ?, ?)'
    ).run(name, description || null, meal_type, price || 0, available_date);
    const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/menu-items/:id', requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Menu item not found' });
    }
    const { name, description, meal_type, price, available_date, active } = req.body;
    db.prepare(
      'UPDATE menu_items SET name=?, description=?, meal_type=?, price=?, available_date=?, active=? WHERE id=?'
    ).run(
      name ?? existing.name,
      description ?? existing.description,
      meal_type ?? existing.meal_type,
      price ?? existing.price,
      available_date ?? existing.available_date,
      active ?? existing.active,
      req.params.id
    );
    const updated = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/menu-items/:id', requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Menu item not found' });
    }
    db.prepare('DELETE FROM menu_items WHERE id = ?').run(req.params.id);
    res.json({ message: 'Menu item deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
