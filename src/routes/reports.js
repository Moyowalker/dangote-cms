const express = require('express');
const mongoose = require('mongoose');
const { Employee, MealRecord } = require('../database');
const { requireAdmin } = require('../middleware/auth');
const { sendError } = require('../utils/apiResponse');
const { getPagination, paginateArray } = require('../utils/pagination');

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
      employee_name: r.employee_id && typeof r.employee_id === 'object' ? r.employee_id.name : null,
      department: r.employee_id && typeof r.employee_id === 'object' ? r.employee_id.department : null,
      employee_number: r.employee_id && typeof r.employee_id === 'object' ? r.employee_id.employee_number : null,
      employee_id: r.employee_id && typeof r.employee_id === 'object'
        ? (r.employee_id._id ? r.employee_id._id.toString() : r.employee_id.id)
        : String(r.employee_id || '') || null
    }));

    const { hasPagination, page, limit } = getPagination(req.query);
    if (!hasPagination) {
      return res.json({ date, summary, details, total: details.length });
    }

    const paginated = paginateArray(details, page, limit);
    return res.json({
      date,
      summary,
      details: paginated.data,
      total: details.length,
      pagination: paginated.pagination
    });
  } catch (err) {
    console.error(err);
    sendError(res, 500, 'Internal server error', 'INTERNAL_ERROR');
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

    const { hasPagination, page, limit } = getPagination(req.query);
    if (!hasPagination) {
      return res.json(data);
    }

    return res.json(paginateArray(data, page, limit));
  } catch (err) {
    console.error(err);
    sendError(res, 500, 'Internal server error', 'INTERNAL_ERROR');
  }
});

router.get('/employee/:id', requireAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return sendError(res, 404, 'Employee not found', 'NOT_FOUND');
    }
    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      return sendError(res, 404, 'Employee not found', 'NOT_FOUND');
    }
    const records = await MealRecord.find({ employee_id: employee._id })
      .sort({ consumption_date: -1, meal_type: 1 });

    const serialized = records.map((r) => r.toJSON());
    const { hasPagination, page, limit } = getPagination(req.query);
    if (!hasPagination) {
      return res.json({ employee: employee.toJSON(), records: serialized, total: records.length });
    }

    const paginated = paginateArray(serialized, page, limit);
    return res.json({
      employee: employee.toJSON(),
      records: paginated.data,
      total: records.length,
      pagination: paginated.pagination
    });
  } catch (err) {
    console.error(err);
    sendError(res, 500, 'Internal server error', 'INTERNAL_ERROR');
  }
});

module.exports = router;
