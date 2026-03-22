const mongoose = require('mongoose');
const { WorkerCategory, EntitlementPolicy, Employee } = require('../database');

const VALID_MEAL_TYPES = ['breakfast', 'lunch', 'dinner'];

function makeError(status, code, message) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

async function listWorkerCategories() {
  return WorkerCategory.find().sort({ name: 1 });
}

async function createWorkerCategory(payload) {
  const { code, name, description, active } = payload;
  if (typeof code !== 'string' || typeof name !== 'string' || !code.trim() || !name.trim()) {
    throw makeError(400, 'VALIDATION_ERROR', 'code and name are required');
  }

  try {
    return await WorkerCategory.create({
      code: code.trim(),
      name: name.trim(),
      description: description || null,
      active: active !== undefined ? Boolean(active) : true
    });
  } catch (err) {
    if (err.code === 11000) {
      throw makeError(409, 'CONFLICT', 'Worker category code already exists');
    }
    throw err;
  }
}

async function updateWorkerCategory(id, payload) {
  if (!isValidId(id)) {
    throw makeError(404, 'NOT_FOUND', 'Worker category not found');
  }

  const { code, name, description, active } = payload;
  const updates = {};
  if (code !== undefined) {
    if (typeof code !== 'string' || !code.trim()) {
      throw makeError(400, 'VALIDATION_ERROR', 'code must be a non-empty string');
    }
    updates.code = code.trim();
  }
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      throw makeError(400, 'VALIDATION_ERROR', 'name must be a non-empty string');
    }
    updates.name = name.trim();
  }
  if (description !== undefined) updates.description = description;
  if (active !== undefined) updates.active = Boolean(active);

  try {
    const updated = await WorkerCategory.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!updated) {
      throw makeError(404, 'NOT_FOUND', 'Worker category not found');
    }

    return updated;
  } catch (err) {
    if (err.code === 11000) {
      throw makeError(409, 'CONFLICT', 'Worker category code already exists');
    }
    throw err;
  }
}

async function deleteWorkerCategory(id) {
  if (!isValidId(id)) {
    throw makeError(404, 'NOT_FOUND', 'Worker category not found');
  }

  const deleted = await WorkerCategory.findByIdAndDelete(id);
  if (!deleted) {
    throw makeError(404, 'NOT_FOUND', 'Worker category not found');
  }

  return deleted;
}

async function listEntitlementPolicies(query) {
  const filter = {};
  if (query.worker_category_id) {
    filter.worker_category_id = query.worker_category_id;
  }
  if (query.meal_type) {
    filter.meal_type = query.meal_type;
  }

  return EntitlementPolicy.find(filter)
    .populate('worker_category_id', 'code name')
    .sort({ meal_type: 1 });
}

async function createEntitlementPolicy(payload) {
  const { worker_category_id, meal_type, daily_limit, active } = payload;
  if (!worker_category_id || !meal_type) {
    throw makeError(400, 'VALIDATION_ERROR', 'worker_category_id and meal_type are required');
  }
  if (!isValidId(worker_category_id)) {
    throw makeError(400, 'VALIDATION_ERROR', 'worker_category_id is invalid');
  }
  if (!VALID_MEAL_TYPES.includes(meal_type)) {
    throw makeError(400, 'VALIDATION_ERROR', `meal_type must be one of: ${VALID_MEAL_TYPES.join(', ')}`);
  }
  if (daily_limit !== undefined && (!Number.isInteger(Number(daily_limit)) || Number(daily_limit) < 0)) {
    throw makeError(400, 'VALIDATION_ERROR', 'daily_limit must be an integer >= 0');
  }

  const category = await WorkerCategory.findById(worker_category_id);
  if (!category) {
    throw makeError(404, 'NOT_FOUND', 'Worker category not found');
  }

  try {
    return await EntitlementPolicy.create({
      worker_category_id,
      meal_type,
      daily_limit: daily_limit !== undefined ? Number(daily_limit) : 1,
      active: active !== undefined ? Boolean(active) : true
    });
  } catch (err) {
    if (err.code === 11000) {
      throw makeError(409, 'CONFLICT', 'Entitlement policy already exists for this category and meal type');
    }
    throw err;
  }
}

async function updateEntitlementPolicy(id, payload) {
  if (!isValidId(id)) {
    throw makeError(404, 'NOT_FOUND', 'Entitlement policy not found');
  }

  const { daily_limit, active } = payload;
  const updates = {};
  if (daily_limit !== undefined) {
    if (!Number.isInteger(Number(daily_limit)) || Number(daily_limit) < 0) {
      throw makeError(400, 'VALIDATION_ERROR', 'daily_limit must be an integer >= 0');
    }
    updates.daily_limit = Number(daily_limit);
  }
  if (active !== undefined) updates.active = Boolean(active);

  const updated = await EntitlementPolicy.findByIdAndUpdate(
    id,
    { $set: updates },
    { new: true, runValidators: true }
  );

  if (!updated) {
    throw makeError(404, 'NOT_FOUND', 'Entitlement policy not found');
  }

  return updated;
}

async function deleteEntitlementPolicy(id) {
  if (!isValidId(id)) {
    throw makeError(404, 'NOT_FOUND', 'Entitlement policy not found');
  }

  const deleted = await EntitlementPolicy.findByIdAndDelete(id);
  if (!deleted) {
    throw makeError(404, 'NOT_FOUND', 'Entitlement policy not found');
  }

  return deleted;
}

async function assignEmployeeCategory(employeeId, workerCategoryId) {
  if (workerCategoryId !== null && workerCategoryId !== undefined && !isValidId(workerCategoryId)) {
    throw makeError(400, 'VALIDATION_ERROR', 'worker_category_id is invalid');
  }
  if (!isValidId(employeeId)) {
    throw makeError(404, 'NOT_FOUND', 'Employee not found');
  }

  if (workerCategoryId) {
    const category = await WorkerCategory.findById(workerCategoryId);
    if (!category) {
      throw makeError(404, 'NOT_FOUND', 'Worker category not found');
    }
  }

  const updated = await Employee.findByIdAndUpdate(
    employeeId,
    { $set: { worker_category_id: workerCategoryId || null } },
    { new: true, runValidators: true }
  );

  if (!updated) {
    throw makeError(404, 'NOT_FOUND', 'Employee not found');
  }

  return updated;
}

module.exports = {
  VALID_MEAL_TYPES,
  listWorkerCategories,
  createWorkerCategory,
  updateWorkerCategory,
  deleteWorkerCategory,
  listEntitlementPolicies,
  createEntitlementPolicy,
  updateEntitlementPolicy,
  deleteEntitlementPolicy,
  assignEmployeeCategory
};
