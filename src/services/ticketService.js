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
  const { badge_number, token, meal_type, canteen_location, notes, collector_badge_number } = payload;
  const prohibitedClientFields = ['allowed', 'consumed', 'remaining', 'can_consume', 'entitlement', 'transaction_reference'];

  const suppliedProhibitedField = prohibitedClientFields.find((field) => Object.prototype.hasOwnProperty.call(payload, field));
  if (suppliedProhibitedField) {
    throw makeError(`client field '${suppliedProhibitedField}' is not accepted`, 400, 'VALIDATION_ERROR');
  }

  const normalizedBadgeNumber = typeof badge_number === 'string' ? badge_number.trim() : '';
  const normalizedToken = typeof token === 'string' ? token.trim() : '';

  if (!normalizedBadgeNumber && !normalizedToken) {
    throw makeError('badge_number or token is required', 400, 'VALIDATION_ERROR');
  }

  const normalizedMealType = normalizeMealType(meal_type);

  if (token !== undefined && (typeof token !== 'string' || !normalizedToken)) {
    throw makeError('token must be a non-empty string', 400, 'VALIDATION_ERROR');
  }

  if (canteen_location !== undefined && (typeof canteen_location !== 'string' || !canteen_location.trim())) {
    throw makeError('canteen_location must be a non-empty string', 400, 'VALIDATION_ERROR');
  }

  if (notes !== undefined && notes !== null && typeof notes !== 'string') {
    throw makeError('notes must be a string', 400, 'VALIDATION_ERROR');
  }

  if (collector_badge_number !== undefined && (typeof collector_badge_number !== 'string' || !collector_badge_number.trim())) {
    throw makeError('collector_badge_number must be a non-empty string', 400, 'VALIDATION_ERROR');
  }

  return {
    badgeNumber: normalizedBadgeNumber,
    token: normalizedToken || null,
    mealType: normalizedMealType,
    canteenLocation: canteen_location ? canteen_location.trim() : 'Main Canteen',
    notes: notes || null,
    collectorBadgeNumber: collector_badge_number ? collector_badge_number.trim() : null
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