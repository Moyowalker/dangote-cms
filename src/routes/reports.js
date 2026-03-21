const express = require('express');
const mongoose = require('mongoose');
const { Employee, MealRecord } = require('../database');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/daily', requireAdmin, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];

    const summary = await MealRecord.aggregate([
      { $match: { consumption_date: date } },
      { $group: { _id: '$meal_type', count: { $sum: 1 } } },
      { $project: { _id: 0, meal_type: '$_id', count: 1 } }
    ]);

    const records = await MealRecord.find({ consumption_date: date })
      .populate('employee_id', 'name department employee_number')
      .sort({ meal_type: 1 });

    const details = records.map((r) => ({
      ...r.toJSON(),
      employee_name: r.employee_id ? r.employee_id.name : null,
      department: r.employee_id ? r.employee_id.department : null,
      employee_number: r.employee_id ? r.employee_id.employee_number : null,
      employee_id: r.employee_id ? r.employee_id._id.toString() : null
    }));

    res.json({ date, summary, details, total: details.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/department', requireAdmin, async (req, res) => {
  try {
    const { date, month } = req.query;
    const matchFilter = {};
    if (date) {
      matchFilter.consumption_date = date;
    } else if (month) {
      // Escape regex special chars to prevent ReDoS / unexpected matching
      const safeMonth = month.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      matchFilter.consumption_date = { $regex: `^${safeMonth}` };
    }

    const data = await MealRecord.aggregate([
      { $match: matchFilter },
      {
        $lookup: {
          from: 'employees',
          localField: 'employee_id',
          foreignField: '_id',
          as: 'employee'
        }
      },
      { $unwind: '$employee' },
      {
        $group: {
          _id: { department: '$employee.department', meal_type: '$meal_type' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.department': 1, '_id.meal_type': 1 } },
      {
        $project: {
          _id: 0,
          department: '$_id.department',
          meal_type: '$_id.meal_type',
          count: 1
        }
      }
    ]);

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/employee/:id', requireAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const records = await MealRecord.find({ employee_id: employee._id })
      .sort({ consumption_date: -1, meal_type: 1 });
    res.json({ employee: employee.toJSON(), records: records.map((r) => r.toJSON()), total: records.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
