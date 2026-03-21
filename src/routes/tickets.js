const express = require('express');
const { MealRecord } = require('../database');
const { requireStaff } = require('../middleware/auth');
const {
  VALID_MEAL_TYPES,
  validateConsumptionEligibility,
  consumeEntitlement,
  rollbackConsumption
} = require('../services/entitlementService');
const { safeWriteAuditLog } = require('../services/auditService');
const {
  normalizeMealType,
  normalizeConsumePayload,
  assertEmployeeLifecycleActive,
  findEmployeeByBadgeOrThrow
} = require('../services/ticketService');
const { sendError } = require('../utils/apiResponse');
const { getPagination, paginateArray } = require('../utils/pagination');

const router = express.Router();

router.get('/validate/:badge_number', requireStaff, async (req, res) => {
  try {
    const { badge_number } = req.params;
    const { meal_type, date } = req.query;
    const actor = req.session.user;

    let employee;
    try {
      employee = await findEmployeeByBadgeOrThrow(badge_number);
    } catch (err) {
      await safeWriteAuditLog({
        actor_user_id: actor?.id,
        actor_role: actor?.role,
        action: 'ticket.validate',
        entity_type: 'employee',
        entity_id: badge_number,
        outcome: 'failure',
        reason: err.message,
        metadata: { badge_number, meal_type: meal_type || 'lunch', date: date || new Date().toISOString().split('T')[0] }
      });
      return sendError(res, err.status || 404, err.message || 'Employee not found', err.code || 'NOT_FOUND');
    }

    try {
      assertEmployeeLifecycleActive(employee);
    } catch (err) {
      await safeWriteAuditLog({
        actor_user_id: actor?.id,
        actor_role: actor?.role,
        action: 'ticket.validate',
        entity_type: 'employee',
        entity_id: employee.id,
        outcome: 'failure',
        reason: err.message,
        metadata: { badge_number }
      });
      return sendError(res, err.status || 403, err.message || 'Employee is not active', err.code || 'FORBIDDEN');
    }

    const checkDate = date || new Date().toISOString().split('T')[0];
    let checkMealType;
    try {
      checkMealType = meal_type ? normalizeMealType(meal_type) : 'lunch';
    } catch (err) {
      await safeWriteAuditLog({
        actor_user_id: actor?.id,
        actor_role: actor?.role,
        action: 'ticket.validate',
        entity_type: 'employee',
        entity_id: employee.id,
        outcome: 'failure',
        reason: err.message,
        metadata: { badge_number, meal_type: checkMealType, date: checkDate }
      });
      return sendError(res, err.status || 400, err.message || 'Invalid meal_type', err.code || 'VALIDATION_ERROR');
    }

    const eligibility = await validateConsumptionEligibility(employee, checkMealType, checkDate);
    const balance = eligibility.balance || { allowed: 0, consumed: 0 };

    await safeWriteAuditLog({
      actor_user_id: actor?.id,
      actor_role: actor?.role,
      action: 'ticket.validate',
      entity_type: 'employee',
      entity_id: employee.id,
      outcome: eligibility.ok ? 'success' : 'failure',
      reason: eligibility.ok ? null : eligibility.error,
      metadata: {
        badge_number,
        meal_type: checkMealType,
        date: checkDate,
        allowed: balance.allowed,
        consumed: balance.consumed,
        remaining: Math.max((balance.allowed || 0) - (balance.consumed || 0), 0)
      }
    });

    res.json({
      employee: employee.toJSON(),
      can_consume: eligibility.ok,
      already_consumed: eligibility.status === 409,
      meal_type: checkMealType,
      date: checkDate,
      allowed: balance.allowed,
      consumed: balance.consumed,
      remaining: Math.max((balance.allowed || 0) - (balance.consumed || 0), 0),
      message: eligibility.ok ? null : eligibility.error
    });
  } catch (err) {
    console.error('Ticket validate error:', err);
    sendError(res, 500, 'Internal server error', 'INTERNAL_ERROR');
  }
});

router.post('/consume', requireStaff, async (req, res) => {
  try {
    const { badge_number, meal_type } = req.body;
    const actor = req.session.user;

    let normalizedPayload;
    try {
      normalizedPayload = normalizeConsumePayload(req.body);
    } catch (err) {
      await safeWriteAuditLog({
        actor_user_id: actor?.id,
        actor_role: actor?.role,
        action: 'ticket.consume',
        entity_type: 'employee',
        entity_id: badge_number || null,
        outcome: 'failure',
        reason: err.message,
        metadata: { badge_number: badge_number || null, meal_type: meal_type || null }
      });
      return sendError(res, err.status || 400, err.message || 'Invalid request body', err.code || 'VALIDATION_ERROR');
    }

    const {
      badgeNumber: normalizedBadge,
      mealType: normalizedMealType,
      canteenLocation,
      notes
    } = normalizedPayload;

    let employee;
    try {
      employee = await findEmployeeByBadgeOrThrow(normalizedBadge);
    } catch (err) {
      await safeWriteAuditLog({
        actor_user_id: actor?.id,
        actor_role: actor?.role,
        action: 'ticket.consume',
        entity_type: 'employee',
        entity_id: normalizedBadge,
        outcome: 'failure',
        reason: err.message,
        metadata: { badge_number: normalizedBadge, meal_type: normalizedMealType }
      });
      return sendError(res, err.status || 404, err.message || 'Employee not found', err.code || 'NOT_FOUND');
    }

    try {
      assertEmployeeLifecycleActive(employee);
    } catch (err) {
      await safeWriteAuditLog({
        actor_user_id: actor?.id,
        actor_role: actor?.role,
        action: 'ticket.consume',
        entity_type: 'employee',
        entity_id: employee.id,
        outcome: 'failure',
        reason: err.message,
        metadata: { badge_number: normalizedBadge, meal_type: normalizedMealType }
      });
      return sendError(res, err.status || 403, err.message || 'Employee is not active', err.code || 'FORBIDDEN');
    }

    const today = new Date().toISOString().split('T')[0];
    const eligibility = await validateConsumptionEligibility(employee, normalizedMealType, today);
    if (!eligibility.ok) {
      await safeWriteAuditLog({
        actor_user_id: actor?.id,
        actor_role: actor?.role,
        action: 'ticket.consume',
        entity_type: 'employee',
        entity_id: employee.id,
        outcome: 'failure',
        reason: eligibility.error,
        metadata: { badge_number, meal_type, date: today }
      });
      return sendError(res, eligibility.status, eligibility.error, 'VALIDATION_ERROR');
    }

    const entitlementResult = await consumeEntitlement(employee, normalizedMealType, today);
    if (!entitlementResult.ok) {
      await safeWriteAuditLog({
        actor_user_id: actor?.id,
        actor_role: actor?.role,
        action: 'ticket.consume',
        entity_type: 'employee',
        entity_id: employee.id,
        outcome: 'failure',
        reason: entitlementResult.error,
        metadata: { badge_number, meal_type, date: today }
      });
      return sendError(res, entitlementResult.status, entitlementResult.error, 'VALIDATION_ERROR');
    }

    try {
      const record = await MealRecord.create({
        employee_id: employee._id,
        meal_type: normalizedMealType,
        consumption_date: today,
        staff_id: req.session.user.id,
        canteen_location: canteenLocation,
        notes
      });

      await safeWriteAuditLog({
        actor_user_id: actor?.id,
        actor_role: actor?.role,
        action: 'ticket.consume',
        entity_type: 'meal_record',
        entity_id: record.id,
        outcome: 'success',
        metadata: {
          employee_id: employee.id,
          badge_number: normalizedBadge,
          meal_type: normalizedMealType,
          date: today,
          remaining: entitlementResult.remaining
        }
      });

      res.status(201).json({
        message: 'Meal recorded successfully',
        record: record.toJSON(),
        employee: employee.toJSON(),
        entitlement: entitlementResult.balance,
        remaining: entitlementResult.remaining
      });
    } catch (insertErr) {
      if (insertErr.code === 11000) {
        await rollbackConsumption(employee, normalizedMealType, today);
        await safeWriteAuditLog({
          actor_user_id: actor?.id,
          actor_role: actor?.role,
          action: 'ticket.consume',
          entity_type: 'employee',
          entity_id: employee.id,
          outcome: 'failure',
          reason: 'Meal already recorded for this employee today',
          metadata: { badge_number: normalizedBadge, meal_type: normalizedMealType, date: today }
        });
        return sendError(res, 409, 'Meal already recorded for this employee today', 'CONFLICT');
      }
      await rollbackConsumption(employee, normalizedMealType, today);
      await safeWriteAuditLog({
        actor_user_id: actor?.id,
        actor_role: actor?.role,
        action: 'ticket.consume',
        entity_type: 'employee',
        entity_id: employee.id,
        outcome: 'failure',
        reason: 'Meal record insert failed',
        metadata: { badge_number: normalizedBadge, meal_type: normalizedMealType, date: today }
      });
      throw insertErr;
    }
  } catch (err) {
    console.error('Ticket consume error:', err);
    sendError(res, 500, 'Internal server error', 'INTERNAL_ERROR');
  }
});

router.get('/history', requireStaff, async (req, res) => {
  try {
    const { employee_id, date, meal_type } = req.query;
    const filter = {};
    if (employee_id) filter.employee_id = employee_id;
    if (date) filter.consumption_date = date;
    if (meal_type) {
      if (!VALID_MEAL_TYPES.includes(meal_type)) {
        return sendError(res, 400, `meal_type must be one of: ${VALID_MEAL_TYPES.join(', ')}`, 'VALIDATION_ERROR');
      }
      filter.meal_type = meal_type;
    }

    const records = await MealRecord.find(filter)
      .populate('employee_id', 'name employee_number badge_number')
      .sort({ consumed_at: -1 });

    const result = records.map((r) => {
      const obj = r.toJSON();
      if (r.employee_id && typeof r.employee_id === 'object') {
        obj.employee_name = r.employee_id.name;
        obj.employee_number = r.employee_id.employee_number;
        obj.badge_number = r.employee_id.badge_number;
        obj.employee_id = r.employee_id._id.toString();
      }
      return obj;
    });

    const { hasPagination, page, limit } = getPagination(req.query);
    if (!hasPagination) {
      return res.json(result);
    }

    return res.json(paginateArray(result, page, limit));
  } catch (err) {
    console.error('Ticket history error:', err);
    sendError(res, 500, 'Internal server error', 'INTERNAL_ERROR');
  }
});

module.exports = router;
