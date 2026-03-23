const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendError } = require('../utils/apiResponse');
const { getPagination, paginateArray } = require('../utils/pagination');
const {
  listEmployees,
  createEmployee,
  getEmployeeById,
  updateEmployee,
  deleteEmployee,
  getEmployeePortalAccess,
  provisionEmployeePortalAccess,
  revokeEmployeePortalAccess
} = require('../services/employeeService');

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

  if (doc.worker_category_id && typeof doc.worker_category_id === 'object' && doc.worker_category_id.name) {
    obj.worker_category_name = doc.worker_category_id.name;
    obj.worker_category_id = doc.worker_category_id._id
      ? doc.worker_category_id._id.toString()
      : doc.worker_category_id.toString();
  } else {
    obj.worker_category_name = null;
  }

  return obj;
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const employees = await listEmployees({ query: req.query, user: req.session.user });
    const formatted = employees.map(formatEmployee);
    const { hasPagination, page, limit } = getPagination(req.query);

    if (!hasPagination) {
      return res.json(formatted);
    }

    const result = paginateArray(formatted, page, limit);
    return res.json(result);
  } catch (err) {
    console.error(err);
    sendError(res, err.status || 500, err.message || 'Internal server error', err.code || 'INTERNAL_ERROR');
  }
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const employee = await createEmployee(req.body);
    res.status(201).json(employee.toJSON());
  } catch (err) {
    console.error(err);
    sendError(res, err.status || 500, err.message || 'Internal server error', err.code || 'INTERNAL_ERROR');
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const employee = await getEmployeeById(req.params.id, req.session.user);
    res.json(formatEmployee(employee));
  } catch (err) {
    console.error(err);
    sendError(res, err.status || 500, err.message || 'Internal server error', err.code || 'INTERNAL_ERROR');
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const updated = await updateEmployee(req.params.id, req.body);
    res.json(formatEmployee(updated));
  } catch (err) {
    console.error(err);
    sendError(res, err.status || 500, err.message || 'Internal server error', err.code || 'INTERNAL_ERROR');
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await deleteEmployee(req.params.id);
    res.json({ message: 'Employee deleted successfully' });
  } catch (err) {
    console.error(err);
    sendError(res, err.status || 500, err.message || 'Internal server error', err.code || 'INTERNAL_ERROR');
  }
});

router.get('/:id/portal-access', requireAdmin, async (req, res) => {
  try {
    const access = await getEmployeePortalAccess(req.params.id);
    res.json(access);
  } catch (err) {
    console.error(err);
    sendError(res, err.status || 500, err.message || 'Internal server error', err.code || 'INTERNAL_ERROR');
  }
});

router.post('/:id/portal-access', requireAdmin, async (req, res) => {
  try {
    const access = await provisionEmployeePortalAccess(req.params.id, req.body);
    res.status(201).json(access);
  } catch (err) {
    console.error(err);
    sendError(res, err.status || 500, err.message || 'Internal server error', err.code || 'INTERNAL_ERROR');
  }
});

router.delete('/:id/portal-access', requireAdmin, async (req, res) => {
  try {
    const result = await revokeEmployeePortalAccess(req.params.id);
    res.json(result);
  } catch (err) {
    console.error(err);
    sendError(res, err.status || 500, err.message || 'Internal server error', err.code || 'INTERNAL_ERROR');
  }
});

module.exports = router;
