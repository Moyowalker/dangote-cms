const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendError } = require('../utils/apiResponse');
const {
  listWorkerCategories,
  listEmployeeCategories,
  createWorkerCategory,
  createEmployeeCategory,
  updateWorkerCategory,
  updateEmployeeCategory,
  deleteWorkerCategory,
  deleteEmployeeCategory,
  listEntitlementPolicies,
  createEntitlementPolicy,
  updateEntitlementPolicy,
  deleteEntitlementPolicy,
  assignEmployeeCategory
} = require('../services/entitlementAdminService');

const router = express.Router();

function formatEntitlementPolicy(policyDoc) {
  const policy = policyDoc.toJSON ? policyDoc.toJSON() : { ...policyDoc };
  policy.employee_category_id = policy.worker_category_id || null;
  return policy;
}

function formatEmployeeCategoryAssignment(employeeDoc) {
  const employee = employeeDoc.toJSON ? employeeDoc.toJSON() : { ...employeeDoc };
  employee.employee_category_id = employee.worker_category_id || null;
  return employee;
}

function formatCategory(categoryDoc) {
  const category = categoryDoc.toJSON ? categoryDoc.toJSON() : { ...categoryDoc };
  category.employee_category_name = category.name || null;
  return category;
}

router.get(['/worker-categories', '/employee-categories'], requireAuth, async (req, res) => {
  try {
    const categories = req.path === '/employee-categories'
      ? await listEmployeeCategories()
      : await listWorkerCategories();
    res.json(categories.map(formatCategory));
  } catch (err) {
    console.error(err);
    sendError(res, err.status || 500, err.message || 'Internal server error', err.code || 'INTERNAL_ERROR');
  }
});

router.post(['/worker-categories', '/employee-categories'], requireAdmin, async (req, res) => {
  try {
    const category = req.path === '/employee-categories'
      ? await createEmployeeCategory(req.body)
      : await createWorkerCategory(req.body);

    res.status(201).json(formatCategory(category));
  } catch (err) {
    console.error(err);
    sendError(res, err.status || 500, err.message || 'Internal server error', err.code || 'INTERNAL_ERROR');
  }
});

router.put(['/worker-categories/:id', '/employee-categories/:id'], requireAdmin, async (req, res) => {
  try {
    const updated = req.path.startsWith('/employee-categories/')
      ? await updateEmployeeCategory(req.params.id, req.body)
      : await updateWorkerCategory(req.params.id, req.body);

    res.json(formatCategory(updated));
  } catch (err) {
    console.error(err);
    sendError(res, err.status || 500, err.message || 'Internal server error', err.code || 'INTERNAL_ERROR');
  }
});

router.delete(['/worker-categories/:id', '/employee-categories/:id'], requireAdmin, async (req, res) => {
  try {
    if (req.path.startsWith('/employee-categories/')) {
      await deleteEmployeeCategory(req.params.id);
      return res.json({ message: 'Employee category deleted successfully' });
    }

    await deleteWorkerCategory(req.params.id);

    res.json({ message: 'Employee category deleted successfully' });
  } catch (err) {
    console.error(err);
    sendError(res, err.status || 500, err.message || 'Internal server error', err.code || 'INTERNAL_ERROR');
  }
});

router.get('/entitlement-policies', requireAuth, async (req, res) => {
  try {
    const policies = await listEntitlementPolicies(req.query);
    res.json(policies.map(formatEntitlementPolicy));
  } catch (err) {
    console.error(err);
    sendError(res, err.status || 500, err.message || 'Internal server error', err.code || 'INTERNAL_ERROR');
  }
});

router.post('/entitlement-policies', requireAdmin, async (req, res) => {
  try {
    const policy = await createEntitlementPolicy(req.body);

    res.status(201).json(formatEntitlementPolicy(policy));
  } catch (err) {
    console.error(err);
    sendError(res, err.status || 500, err.message || 'Internal server error', err.code || 'INTERNAL_ERROR');
  }
});

router.put('/entitlement-policies/:id', requireAdmin, async (req, res) => {
  try {
    const updated = await updateEntitlementPolicy(req.params.id, req.body);

    res.json(formatEntitlementPolicy(updated));
  } catch (err) {
    console.error(err);
    sendError(res, err.status || 500, err.message || 'Internal server error', err.code || 'INTERNAL_ERROR');
  }
});

router.delete('/entitlement-policies/:id', requireAdmin, async (req, res) => {
  try {
    await deleteEntitlementPolicy(req.params.id);

    res.json({ message: 'Entitlement policy deleted successfully' });
  } catch (err) {
    console.error(err);
    sendError(res, err.status || 500, err.message || 'Internal server error', err.code || 'INTERNAL_ERROR');
  }
});

router.put('/employees/:id/category', requireAdmin, async (req, res) => {
  try {
    const updated = await assignEmployeeCategory(
      req.params.id,
      req.body.employee_category_id !== undefined ? req.body.employee_category_id : req.body.worker_category_id
    );

    res.json(formatEmployeeCategoryAssignment(updated));
  } catch (err) {
    console.error(err);
    sendError(res, err.status || 500, err.message || 'Internal server error', err.code || 'INTERNAL_ERROR');
  }
});

module.exports = router;