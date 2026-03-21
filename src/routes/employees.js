const express = require('express');
const mongoose = require('mongoose');
const { Employee } = require('../database');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Flatten a Mongoose employee document for the response, adding meal_plan_name
function formatEmployee(doc) {
  const obj = doc.toJSON ? doc.toJSON() : { ...doc };
  if (doc.meal_plan_id && typeof doc.meal_plan_id === 'object' && doc.meal_plan_id.name) {
    obj.meal_plan_name = doc.meal_plan_id.name;
    obj.meal_plan_id = doc.meal_plan_id._id
      ? doc.meal_plan_id._id.toString()
      : doc.meal_plan_id.toString();
  } else {
    obj.meal_plan_name = null;
  }
  return obj;
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const { search, department } = req.query;
    const filter = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { employee_number: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    if (department) {
      filter.department = department;
    }
    const employees = await Employee.find(filter)
      .populate('meal_plan_id', 'name')
      .sort({ name: 1 });
    res.json(employees.map(formatEmployee));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const { employee_number, name, department, email, phone, badge_number, meal_plan_id } = req.body;
    if (!employee_number || !name || !department || !badge_number) {
      return res.status(400).json({ error: 'employee_number, name, department, and badge_number are required' });
    }
    const employee = await Employee.create({
      employee_number,
      name,
      department,
      email: email || null,
      phone: phone || null,
      badge_number,
      meal_plan_id: meal_plan_id || null
    });
    res.status(201).json(employee.toJSON());
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Employee number, email, or badge number already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const employee = await Employee.findById(req.params.id).populate('meal_plan_id', 'name');
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    res.json(formatEmployee(employee));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const { employee_number, name, department, email, phone, badge_number, meal_plan_id, active } = req.body;
    const updates = {};
    if (employee_number !== undefined) updates.employee_number = employee_number;
    if (name !== undefined) updates.name = name;
    if (department !== undefined) updates.department = department;
    if (email !== undefined) updates.email = email;
    if (phone !== undefined) updates.phone = phone;
    if (badge_number !== undefined) updates.badge_number = badge_number;
    if (meal_plan_id !== undefined) updates.meal_plan_id = meal_plan_id;
    if (active !== undefined) updates.active = active;

    const updated = await Employee.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    ).populate('meal_plan_id', 'name');

    if (!updated) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    res.json(formatEmployee(updated));
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Employee number, email, or badge number already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const deleted = await Employee.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    res.json({ message: 'Employee deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
