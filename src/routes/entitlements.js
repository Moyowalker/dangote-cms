const express = require('express');
const mongoose = require('mongoose');
const { WorkerCategory, EntitlementPolicy, Employee } = require('../database');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendError } = require('../utils/apiResponse');

const router = express.Router();
const VALID_MEAL_TYPES = ['breakfast', 'lunch', 'dinner'];

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

router.get('/worker-categories', requireAuth, async (req, res) => {
  try {
    const categories = await WorkerCategory.find().sort({ name: 1 });
    res.json(categories);
  } catch (err) {
    console.error(err);
    sendError(res, 500, 'Internal server error', 'INTERNAL_ERROR');
  }
});

router.post('/worker-categories', requireAdmin, async (req, res) => {
  try {
    const { code, name, description, active } = req.body;
    if (typeof code !== 'string' || typeof name !== 'string' || !code.trim() || !name.trim()) {
      return sendError(res, 400, 'code and name are required', 'VALIDATION_ERROR');
    }

    const category = await WorkerCategory.create({
      code: code.trim(),
      name: name.trim(),
      description: description || null,
      active: active !== undefined ? Boolean(active) : true
    });

    res.status(201).json(category.toJSON());
  } catch (err) {
    if (err.code === 11000) {
      return sendError(res, 409, 'Worker category code already exists', 'CONFLICT');
    }
    console.error(err);
    sendError(res, 500, 'Internal server error', 'INTERNAL_ERROR');
  }
});

router.put('/worker-categories/:id', requireAdmin, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return sendError(res, 404, 'Worker category not found', 'NOT_FOUND');
    }

    const { code, name, description, active } = req.body;
    const updates = {};
    if (code !== undefined) {
      if (typeof code !== 'string' || !code.trim()) {
        return sendError(res, 400, 'code must be a non-empty string', 'VALIDATION_ERROR');
      }
      updates.code = code.trim();
    }
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return sendError(res, 400, 'name must be a non-empty string', 'VALIDATION_ERROR');
      }
      updates.name = name.trim();
    }
    if (description !== undefined) updates.description = description;
    if (active !== undefined) updates.active = Boolean(active);

    const updated = await WorkerCategory.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return sendError(res, 404, 'Worker category not found', 'NOT_FOUND');
    }

    res.json(updated.toJSON());
  } catch (err) {
    if (err.code === 11000) {
      return sendError(res, 409, 'Worker category code already exists', 'CONFLICT');
    }
    console.error(err);
    sendError(res, 500, 'Internal server error', 'INTERNAL_ERROR');
  }
});

router.delete('/worker-categories/:id', requireAdmin, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return sendError(res, 404, 'Worker category not found', 'NOT_FOUND');
    }

    const deleted = await WorkerCategory.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return sendError(res, 404, 'Worker category not found', 'NOT_FOUND');
    }

    res.json({ message: 'Worker category deleted successfully' });
  } catch (err) {
    console.error(err);
    sendError(res, 500, 'Internal server error', 'INTERNAL_ERROR');
  }
});

router.get('/entitlement-policies', requireAuth, async (req, res) => {
  try {
    const filter = {};
    if (req.query.worker_category_id) {
      filter.worker_category_id = req.query.worker_category_id;
    }
    if (req.query.meal_type) {
      filter.meal_type = req.query.meal_type;
    }

    const policies = await EntitlementPolicy.find(filter)
      .populate('worker_category_id', 'code name')
      .sort({ meal_type: 1 });
    res.json(policies.map((p) => p.toJSON()));
  } catch (err) {
    console.error(err);
    sendError(res, 500, 'Internal server error', 'INTERNAL_ERROR');
  }
});

router.post('/entitlement-policies', requireAdmin, async (req, res) => {
  try {
    const { worker_category_id, meal_type, daily_limit, active } = req.body;
    if (!worker_category_id || !meal_type) {
      return sendError(res, 400, 'worker_category_id and meal_type are required', 'VALIDATION_ERROR');
    }
    if (!isValidId(worker_category_id)) {
      return sendError(res, 400, 'worker_category_id is invalid', 'VALIDATION_ERROR');
    }
    if (!VALID_MEAL_TYPES.includes(meal_type)) {
      return sendError(res, 400, `meal_type must be one of: ${VALID_MEAL_TYPES.join(', ')}`, 'VALIDATION_ERROR');
    }
    if (daily_limit !== undefined && (!Number.isInteger(Number(daily_limit)) || Number(daily_limit) < 0)) {
      return sendError(res, 400, 'daily_limit must be an integer >= 0', 'VALIDATION_ERROR');
    }

    const category = await WorkerCategory.findById(worker_category_id);
    if (!category) {
      return sendError(res, 404, 'Worker category not found', 'NOT_FOUND');
    }

    const policy = await EntitlementPolicy.create({
      worker_category_id,
      meal_type,
      daily_limit: daily_limit !== undefined ? Number(daily_limit) : 1,
      active: active !== undefined ? Boolean(active) : true
    });

    res.status(201).json(policy.toJSON());
  } catch (err) {
    if (err.code === 11000) {
      return sendError(res, 409, 'Entitlement policy already exists for this category and meal type', 'CONFLICT');
    }
    console.error(err);
    sendError(res, 500, 'Internal server error', 'INTERNAL_ERROR');
  }
});

router.put('/entitlement-policies/:id', requireAdmin, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return sendError(res, 404, 'Entitlement policy not found', 'NOT_FOUND');
    }

    const { daily_limit, active } = req.body;
    const updates = {};
    if (daily_limit !== undefined) {
      if (!Number.isInteger(Number(daily_limit)) || Number(daily_limit) < 0) {
        return sendError(res, 400, 'daily_limit must be an integer >= 0', 'VALIDATION_ERROR');
      }
      updates.daily_limit = Number(daily_limit);
    }
    if (active !== undefined) updates.active = Boolean(active);

    const updated = await EntitlementPolicy.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return sendError(res, 404, 'Entitlement policy not found', 'NOT_FOUND');
    }

    res.json(updated.toJSON());
  } catch (err) {
    console.error(err);
    sendError(res, 500, 'Internal server error', 'INTERNAL_ERROR');
  }
});

router.delete('/entitlement-policies/:id', requireAdmin, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return sendError(res, 404, 'Entitlement policy not found', 'NOT_FOUND');
    }

    const deleted = await EntitlementPolicy.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return sendError(res, 404, 'Entitlement policy not found', 'NOT_FOUND');
    }

    res.json({ message: 'Entitlement policy deleted successfully' });
  } catch (err) {
    console.error(err);
    sendError(res, 500, 'Internal server error', 'INTERNAL_ERROR');
  }
});

router.put('/employees/:id/category', requireAdmin, async (req, res) => {
  try {
    const { worker_category_id } = req.body;
    if (worker_category_id !== null && worker_category_id !== undefined && !isValidId(worker_category_id)) {
      return sendError(res, 400, 'worker_category_id is invalid', 'VALIDATION_ERROR');
    }
    if (!isValidId(req.params.id)) {
      return sendError(res, 404, 'Employee not found', 'NOT_FOUND');
    }

    if (worker_category_id) {
      const category = await WorkerCategory.findById(worker_category_id);
      if (!category) {
        return sendError(res, 404, 'Worker category not found', 'NOT_FOUND');
      }
    }

    const updated = await Employee.findByIdAndUpdate(
      req.params.id,
      { $set: { worker_category_id: worker_category_id || null } },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return sendError(res, 404, 'Employee not found', 'NOT_FOUND');
    }

    res.json(updated.toJSON());
  } catch (err) {
    console.error(err);
    sendError(res, 500, 'Internal server error', 'INTERNAL_ERROR');
  }
});

module.exports = router;