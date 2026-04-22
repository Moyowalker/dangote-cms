const mongoose = require('mongoose');
const { EmployeeCategory, EntitlementPolicy, Employee } = require('../database');

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

function getEmployeeCategoryId(input) {
  if (!input || typeof input !== 'object') {
    return undefined;
  }

  if (input.employee_category_id !== undefined) {
    return input.employee_category_id;
  }

  return input.worker_category_id;
}

async function listWorkerCategories() {
  return EmployeeCategory.find().sort({ name: 1 });
}

async function listEmployeeCategories() {
  return listWorkerCategories();
}

async function createWorkerCategory(payload) {
  const { code, name, description, active } = payload;
  if (typeof code !== 'string' || typeof name !== 'string' || !code.trim() || !name.trim()) {
    throw makeError(400, 'VALIDATION_ERROR', 'code and name are required');
  }

  try {
    return await EmployeeCategory.create({
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

async function createEmployeeCategory(payload) {
  return createWorkerCategory(payload);
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
    const updated = await EmployeeCategory.findByIdAndUpdate(
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

async function updateEmployeeCategory(id, payload) {
  return updateWorkerCategory(id, payload);
}

async function deleteWorkerCategory(id) {
  if (!isValidId(id)) {
    throw makeError(404, 'NOT_FOUND', 'Worker category not found');
  }

  const deleted = await EmployeeCategory.findByIdAndDelete(id);
  if (!deleted) {
    throw makeError(404, 'NOT_FOUND', 'Worker category not found');
  }

  return deleted;
}

async function deleteEmployeeCategory(id) {
  return deleteWorkerCategory(id);
}

async function listEntitlementPolicies(query) {
  const filter = {};
  const employeeCategoryId = getEmployeeCategoryId(query);
  if (employeeCategoryId) {
    filter.worker_category_id = employeeCategoryId;
  }
  if (query.meal_type) {
    filter.meal_type = query.meal_type;
  }

  return EntitlementPolicy.find(filter)
    .populate('worker_category_id', 'code name')
    .sort({ meal_type: 1 });
}

async function createEntitlementPolicy(payload) {
  const { meal_type, daily_limit, active } = payload;
  const employeeCategoryId = getEmployeeCategoryId(payload);
  if (!employeeCategoryId || !meal_type) {
    throw makeError(400, 'VALIDATION_ERROR', 'employee_category_id and meal_type are required');
  }
  if (!isValidId(employeeCategoryId)) {
    throw makeError(400, 'VALIDATION_ERROR', 'employee_category_id is invalid');
  }
  if (!VALID_MEAL_TYPES.includes(meal_type)) {
    throw makeError(400, 'VALIDATION_ERROR', `meal_type must be one of: ${VALID_MEAL_TYPES.join(', ')}`);
  }
  if (daily_limit !== undefined && (!Number.isInteger(Number(daily_limit)) || Number(daily_limit) < 0)) {
    throw makeError(400, 'VALIDATION_ERROR', 'daily_limit must be an integer >= 0');
  }

  const category = await EmployeeCategory.findById(employeeCategoryId);
  if (!category) {
    throw makeError(404, 'NOT_FOUND', 'Worker category not found');
  }

  try {
    return await EntitlementPolicy.create({
      worker_category_id: employeeCategoryId,
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
    throw makeError(400, 'VALIDATION_ERROR', 'employee_category_id is invalid');
  }
  if (!isValidId(employeeId)) {
    throw makeError(404, 'NOT_FOUND', 'Employee not found');
  }

  if (workerCategoryId) {
    const category = await EmployeeCategory.findById(workerCategoryId);
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
};
