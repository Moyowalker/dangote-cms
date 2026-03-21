const { Employee } = require('../database');
const { VALID_MEAL_TYPES } = require('./entitlementService');

function makeError(message, status, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function normalizeMealType(mealType) {
  if (typeof mealType !== 'string' || !mealType.trim()) {
    throw makeError('meal_type is required', 400, 'VALIDATION_ERROR');
  }

  const normalizedMealType = mealType.trim();
  if (!VALID_MEAL_TYPES.includes(normalizedMealType)) {
    throw makeError(`meal_type must be one of: ${VALID_MEAL_TYPES.join(', ')}`, 400, 'VALIDATION_ERROR');
  }

  return normalizedMealType;
}

function normalizeConsumePayload(payload) {
  const { badge_number, meal_type, canteen_location, notes } = payload;

  if (typeof badge_number !== 'string' || !badge_number.trim()) {
    throw makeError('badge_number and meal_type are required', 400, 'VALIDATION_ERROR');
  }

  const normalizedMealType = normalizeMealType(meal_type);

  if (canteen_location !== undefined && (typeof canteen_location !== 'string' || !canteen_location.trim())) {
    throw makeError('canteen_location must be a non-empty string', 400, 'VALIDATION_ERROR');
  }

  if (notes !== undefined && notes !== null && typeof notes !== 'string') {
    throw makeError('notes must be a string', 400, 'VALIDATION_ERROR');
  }

  return {
    badgeNumber: badge_number.trim(),
    mealType: normalizedMealType,
    canteenLocation: canteen_location ? canteen_location.trim() : 'Main Canteen',
    notes: notes || null
  };
}

function assertEmployeeLifecycleActive(employee) {
  if (employee.status === 'suspended') {
    throw makeError('Employee is suspended', 403, 'FORBIDDEN');
  }

  if (employee.status === 'deactivated' || employee.active === false) {
    throw makeError('Employee is deactivated', 403, 'FORBIDDEN');
  }
}

async function findEmployeeByBadgeOrThrow(badgeNumber) {
  const employee = await Employee.findOne({ badge_number: badgeNumber });
  if (!employee) {
    throw makeError('Employee not found', 404, 'NOT_FOUND');
  }
  return employee;
}

module.exports = {
  makeError,
  normalizeMealType,
  normalizeConsumePayload,
  assertEmployeeLifecycleActive,
  findEmployeeByBadgeOrThrow
};