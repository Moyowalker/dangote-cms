const express = require('express');
const mongoose = require('mongoose');
const { Employee, MealRecord } = require('../database');
const { requireReportViewer } = require('../middleware/auth');
const { sendError } = require('../utils/apiResponse');
const { getPagination, paginateArray } = require('../utils/pagination');
const { getAuditLogById, listAuditLogs } = require('../services/auditService');
const { buildDailyReport, buildFailureReport } = require('../services/reportService');

const router = express.Router();

function hasPhoneNumber(employee) {
  return typeof employee.phone === 'string' && employee.phone.trim().length > 0;
}

function hasProfilePhoto(employee) {
  return typeof employee.photo_data_url === 'string' && employee.photo_data_url.trim().length > 0;
}

function buildEmployeeReadinessPayload(employees) {
  const employeesNeedingAttention = employees
    .map((employeeDoc) => {
      const employee = employeeDoc.toJSON ? employeeDoc.toJSON() : { ...employeeDoc };
      const phonePresent = hasPhoneNumber(employee);
      const photoPresent = hasProfilePhoto(employee);

      return {
        ...employee,
        phone_present: phonePresent,
        photo_present: photoPresent,
        missing_phone: !phonePresent,
        missing_photo: !photoPresent
      };
    })
    .filter((employee) => employee.missing_phone || employee.missing_photo);

  const summary = {
    active_employees: employees.length,
    missing_phone: employeesNeedingAttention.filter((employee) => employee.missing_phone).length,
    missing_photo: employeesNeedingAttention.filter((employee) => employee.missing_photo).length,
    missing_both: employeesNeedingAttention.filter((employee) => employee.missing_phone && employee.missing_photo).length,
    ready_employees: employees.length - employeesNeedingAttention.length
  };

  return {
    summary,
    employees: employeesNeedingAttention,
    total: employeesNeedingAttention.length
  };
}

router.get('/daily', requireReportViewer, async (req, res) => {
  try {
    const report = await buildDailyReport(req.query);
    const selectedDate = report.date || null;
    const summary = report.summary || [];
    const details = report.details || [];

    const { hasPagination, page, limit } = getPagination(req.query);
    if (!hasPagination) {
      return res.json({ date: selectedDate || null, summary, details, total: details.length });
    }

    const paginated = paginateArray(details, page, limit);
    return res.json({
      date: selectedDate || null,
      summary,
      details: paginated.data,
      total: details.length,
      pagination: paginated.pagination
    });
  } catch (err) {
    console.error(err);
    sendError(res, err.status || 500, err.message || 'Internal server error', err.code || 'INTERNAL_ERROR');
  }
});

router.get('/department', requireReportViewer, async (req, res) => {
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

router.get('/failures', requireReportViewer, async (req, res) => {
  try {
    const report = await buildFailureReport(req.query);
    const selectedDate = report.date || null;
    const summary = report.summary || [];
    const details = report.details || [];

    const { hasPagination, page, limit } = getPagination(req.query);
    if (!hasPagination) {
      return res.json({ date: selectedDate || null, summary, details, total: details.length });
    }

    const paginated = paginateArray(details, page, limit);
    return res.json({
      date: selectedDate || null,
      summary,
      details: paginated.data,
      total: details.length,
      pagination: paginated.pagination
    });
  } catch (err) {
    console.error(err);
    sendError(res, err.status || 500, err.message || 'Internal server error', err.code || 'INTERNAL_ERROR');
  }
});

router.get('/audit', requireReportViewer, async (req, res) => {
  try {
    const audit = await listAuditLogs(req.query || {});
    const { hasPagination, page, limit } = getPagination(req.query);

    if (!hasPagination) {
      return res.json(audit);
    }

    const paginated = paginateArray(audit.entries, page, limit);
    return res.json({
      total: audit.total,
      summary: audit.summary,
      entries: paginated.data,
      pagination: paginated.pagination
    });
  } catch (err) {
    console.error(err);
    sendError(res, err.status || 500, err.message || 'Internal server error', err.code || 'INTERNAL_ERROR');
  }
});

router.get('/audit/:id', requireReportViewer, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return sendError(res, 404, 'Audit log entry not found', 'NOT_FOUND');
    }

    const entry = await getAuditLogById(req.params.id);
    return res.json(entry);
  } catch (err) {
    console.error(err);
    sendError(res, err.status || 500, err.message || 'Internal server error', err.code || 'INTERNAL_ERROR');
  }
});

router.get(['/worker-readiness', '/employee-readiness'], requireReportViewer, async (req, res) => {
  try {
    const employees = await Employee.find({ active: true }).sort({ name: 1 });
    const payload = buildEmployeeReadinessPayload(employees);

    if (req.path === '/worker-readiness') {
      return res.json({
        summary: {
          active_workers: payload.summary.active_employees,
          missing_phone: payload.summary.missing_phone,
          missing_photo: payload.summary.missing_photo,
          missing_both: payload.summary.missing_both,
          ready_workers: payload.summary.ready_employees
        },
        workers: payload.employees,
        total: payload.total
      });
    }

    return res.json(payload);
  } catch (err) {
    console.error(err);
    return sendError(res, err.status || 500, err.message || 'Internal server error', err.code || 'INTERNAL_ERROR');
  }
});

router.get('/employee/:id', requireReportViewer, async (req, res) => {
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
