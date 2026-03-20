const express = require('express');
const { Employee, MealRecord } = require('../database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/validate/:badge_number', requireAuth, async (req, res) => {
  try {
    const { badge_number } = req.params;
    const { meal_type, date } = req.query;

    const employee = await Employee.findOne({ badge_number, active: true });
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const checkDate = date || new Date().toISOString().split('T')[0];
    const checkMealType = meal_type || 'lunch';

    const existing = await MealRecord.findOne({
      employee_id: employee._id,
      meal_type: checkMealType,
      consumption_date: checkDate
    });

    res.json({
      employee: employee.toJSON(),
      can_consume: !existing,
      already_consumed: !!existing,
      meal_type: checkMealType,
      date: checkDate
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/consume', requireAuth, async (req, res) => {
  try {
    const { badge_number, meal_type, canteen_location, notes } = req.body;

    if (!badge_number || !meal_type) {
      return res.status(400).json({ error: 'badge_number and meal_type are required' });
    }

    const employee = await Employee.findOne({ badge_number, active: true });
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const today = new Date().toISOString().split('T')[0];

    try {
      const record = await MealRecord.create({
        employee_id: employee._id,
        meal_type,
        consumption_date: today,
        staff_id: req.session.user.id,
        canteen_location: canteen_location || 'Main Canteen',
        notes: notes || null
      });
      res.status(201).json({ message: 'Meal recorded successfully', record: record.toJSON(), employee: employee.toJSON() });
    } catch (insertErr) {
      if (insertErr.code === 11000) {
        return res.status(409).json({ error: 'Meal already recorded for this employee today' });
      }
      throw insertErr;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/history', requireAuth, async (req, res) => {
  try {
    const { employee_id, date, meal_type } = req.query;
    const filter = {};
    if (employee_id) filter.employee_id = employee_id;
    if (date) filter.consumption_date = date;
    if (meal_type) filter.meal_type = meal_type;

    const records = await MealRecord.find(filter)
      .populate('employee_id', 'name employee_number badge_number')
      .sort({ consumed_at: -1 });

    const result = records.map((r) => {
      const obj = r.toJSON();
      if (r.employee_id && typeof r.employee_id === 'object') {
        obj.employee_name = r.employee_id.name;
        obj.employee_number = r.employee_id.employee_number;
        obj.badge_number = r.employee_id.badge_number;
        obj.employee_id = r.employee_id._id.toString();
      }
      return obj;
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
