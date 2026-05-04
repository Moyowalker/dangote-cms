const express = require('express');
const mongoose = require('mongoose');
const { Employee, MealRecord, DelegatedMealApproval } = require('../database');
const { requireAuth, requireAdmin, requireVendorAccess } = require('../middleware/auth');
const {
  VALID_MEAL_TYPES,
  validateConsumptionEligibility,
  consumeEntitlement,
  rollbackConsumption,
  getEmployeeMealStatus
} = require('../services/entitlementService');
const { safeWriteAuditLog } = require('../services/auditService');
const {
  normalizeMealType,
  normalizeConsumePayload,
  assertEmployeeLifecycleActive,
  findEmployeeByBadgeOrThrow
} = require('../services/ticketService');
const {
  issueSignedQrToken,
  verifySignedQrToken,
  markQrTokenConsumed,
  resetQrTokenConsumption,
  DEFAULT_TTL_SECONDS
} = require('../services/qrTokenService');
const { createConsumptionTransaction } = require('../services/transactionService');
const { sendError } = require('../utils/apiResponse');
const { getPagination, paginateArray } = require('../utils/pagination');
const { ROLE, canonicalizeRole } = require('../utils/roles');

const router = express.Router();

function isLegacyStaffIdFallbackEnabled() {
  const configured = process.env.LEGACY_STAFF_ID_FALLBACK_ENABLED;

  if (configured === undefined) {
    return true;
  }

  return !['0', 'false', 'no', 'off'].includes(String(configured).trim().toLowerCase());
}

function isIsoDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function formatSelfServiceEmployee(employee) {
  const payload = employee.toJSON();

  if (employee.meal_plan_id && typeof employee.meal_plan_id === 'object') {
    payload.meal_plan_name = employee.meal_plan_id.name || null;
    payload.meal_plan_id = employee.meal_plan_id._id
      ? employee.meal_plan_id._id.toString()
      : employee.meal_plan_id.toString();
  } else {
    payload.meal_plan_name = null;
  }

  if (employee.worker_category_id && typeof employee.worker_category_id === 'object') {
    payload.worker_category_name = employee.worker_category_id.name || null;
    payload.worker_category_code = employee.worker_category_id.code || null;
    payload.worker_category_id = employee.worker_category_id._id
      ? employee.worker_category_id._id.toString()
      : employee.worker_category_id.toString();
    payload.employee_category_name = payload.worker_category_name;
    payload.employee_category_code = payload.worker_category_code;
    payload.employee_category_id = payload.worker_category_id;
  } else {
    payload.worker_category_name = null;
    payload.worker_category_code = null;
    payload.employee_category_name = null;
    payload.employee_category_code = null;
    payload.employee_category_id = null;
  }

  return payload;
}

function canActorIssueQrTokenForEmployee(actor, employee) {
  const role = canonicalizeRole(actor?.role);

  if (role === ROLE.ADMIN || role === ROLE.VENDOR) {
    return true;
  }

  return role === ROLE.EMPLOYEE
    && actor?.employee_id
    && String(actor.employee_id) === String(employee?._id);
}

function makeRouteError(message, status = 400, code = 'VALIDATION_ERROR') {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function buildDelegationPayload(collector, approval) {
  if (!collector || !approval) {
    return null;
  }

  return {
    approval_id: approval.id,
    reason: approval.reason,
    approval_date: approval.approval_date,
    valid_until: approval.valid_until,
    approved_by_user_id: approval.approved_by_user_id ? String(approval.approved_by_user_id) : null,
    approved_by_role: approval.approved_by_role || null,
    collector: {
      id: collector.id,
      name: collector.name,
      employee_number: collector.employee_number,
      badge_number: collector.badge_number,
      department: collector.department,
      photo_data_url: collector.photo_data_url || null
    }
  };
}

async function hydrateDelegatedApproval(approval) {
  if (!approval) {
    return null;
  }

  const [absentEmployee, collectorEmployee] = await Promise.all([
    Employee.findById(approval.absent_employee_id),
    Employee.findById(approval.collector_employee_id)
  ]);

  const payload = approval.toJSON ? approval.toJSON() : { ...approval };

  return {
    ...payload,
    absent_employee: absentEmployee ? absentEmployee.toJSON() : null,
    collector_employee: collectorEmployee ? collectorEmployee.toJSON() : null
  };
}

async function resolveDelegationRequest(body, actor, employee) {
  const delegatedToEmployeeId = typeof body?.delegated_to_employee_id === 'string' ? body.delegated_to_employee_id.trim() : '';
  const delegatedToBadgeNumber = typeof body?.delegated_to_badge_number === 'string' ? body.delegated_to_badge_number.trim() : '';
  const delegationReason = typeof body?.delegation_reason === 'string' ? body.delegation_reason.trim() : '';
  const delegationNotes = typeof body?.delegation_notes === 'string' ? body.delegation_notes.trim() : '';

  if (!delegatedToEmployeeId && !delegatedToBadgeNumber && !delegationReason && !delegationNotes) {
    return null;
  }

  if (canonicalizeRole(actor?.role) !== ROLE.ADMIN) {
    throw makeRouteError('Delegated collection approval requires admin access', 403, 'FORBIDDEN');
  }

  if (!delegatedToEmployeeId && !delegatedToBadgeNumber) {
    throw makeRouteError('delegated_to_employee_id or delegated_to_badge_number is required for delegated collection', 400, 'VALIDATION_ERROR');
  }

  if (!delegationReason) {
    throw makeRouteError('delegation_reason is required for delegated collection', 400, 'VALIDATION_ERROR');
  }

  let collector;
  if (delegatedToEmployeeId) {
    if (!mongoose.Types.ObjectId.isValid(delegatedToEmployeeId)) {
      throw makeRouteError('delegated_to_employee_id must be a valid id', 400, 'VALIDATION_ERROR');
    }
    collector = await Employee.findById(delegatedToEmployeeId);
  } else {
    collector = await Employee.findOne({ badge_number: delegatedToBadgeNumber });
  }

  if (!collector) {
    throw makeRouteError('Approved collector not found', 404, 'NOT_FOUND');
  }

  if (String(collector._id) === String(employee._id)) {
    throw makeRouteError('Collector must be different from the absent worker', 400, 'VALIDATION_ERROR');
  }

  assertEmployeeLifecycleActive(collector);

  return {
    collector,
    reason: delegationReason,
    notes: delegationNotes || null
  };
}

async function loadDelegationContextOrThrow(verifiedQr, employee) {
  if (!verifiedQr?.delegation_approval_id) {
    return null;
  }

  const approval = await DelegatedMealApproval.findById(verifiedQr.delegation_approval_id);
  if (!approval) {
    throw makeRouteError('Delegated collection approval not found', 404, 'NOT_FOUND');
  }

  if (approval.status !== 'active') {
    throw makeRouteError('Delegated collection approval is no longer active', 409, 'INVALID_DELEGATION');
  }

  if (new Date(approval.valid_until).getTime() <= Date.now()) {
    await DelegatedMealApproval.findByIdAndUpdate(approval._id, { $set: { status: 'expired' } });
    throw makeRouteError('Delegated collection approval has expired', 409, 'INVALID_DELEGATION');
  }

  if (String(approval.absent_employee_id) !== String(employee._id)) {
    throw makeRouteError('Delegated collection approval does not match the token worker', 409, 'INVALID_DELEGATION');
  }

  const collector = await Employee.findById(approval.collector_employee_id);
  if (!collector) {
    throw makeRouteError('Approved collector not found', 404, 'NOT_FOUND');
  }

  assertEmployeeLifecycleActive(collector);

  return { approval, collector };
}

router.get('/delegations', requireAdmin, async (req, res) => {
  try {
    const requestedStatus = typeof req.query.status === 'string' && req.query.status.trim()
      ? req.query.status.trim()
      : 'active';
    const allowedStatuses = ['active', 'consumed', 'expired', 'revoked', 'all'];

    if (!allowedStatuses.includes(requestedStatus)) {
      return sendError(res, 400, `status must be one of: ${allowedStatuses.join(', ')}`, 'VALIDATION_ERROR');
    }

    const approvals = await DelegatedMealApproval.find(requestedStatus === 'all' ? {} : { status: requestedStatus });
    const sortedApprovals = [...approvals].sort((left, right) => {
      const leftTime = new Date(left.created_at || 0).getTime();
      const rightTime = new Date(right.created_at || 0).getTime();
      return rightTime - leftTime;
    });
    const entries = await Promise.all(sortedApprovals.map((approval) => hydrateDelegatedApproval(approval)));

    return res.json({ total: entries.length, entries });
  } catch (err) {
    console.error('Ticket delegation list error:', err);
    return sendError(res, err.status || 500, err.message || 'Internal server error', err.code || 'INTERNAL_ERROR');
  }
});

router.patch('/delegations/:id/revoke', requireAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return sendError(res, 404, 'Delegated collection approval not found', 'NOT_FOUND');
    }

    const approval = await DelegatedMealApproval.findById(req.params.id);
    if (!approval) {
      return sendError(res, 404, 'Delegated collection approval not found', 'NOT_FOUND');
    }

    if (approval.status !== 'active') {
      return sendError(res, 409, 'Only active delegated collection approvals can be revoked', 'VALIDATION_ERROR');
    }

    const actor = req.session.user;
    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
    const updated = await DelegatedMealApproval.findByIdAndUpdate(
      approval._id,
      {
        $set: {
          status: 'revoked',
          notes: note || approval.notes || null
        }
      },
      { new: true }
    );

    await safeWriteAuditLog({
      actor_user_id: actor?.id,
      actor_role: actor?.role,
      action: 'ticket.delegation.revoke',
      entity_type: 'delegated_meal_approval',
      entity_id: updated.id,
      outcome: 'success',
      metadata: {
        absent_employee_id: String(updated.absent_employee_id),
        collector_employee_id: String(updated.collector_employee_id),
        note: note || null
      }
    });

    return res.json(await hydrateDelegatedApproval(updated));
  } catch (err) {
    console.error('Ticket delegation revoke error:', err);
    return sendError(res, err.status || 500, err.message || 'Internal server error', err.code || 'INTERNAL_ERROR');
  }
});

router.get('/self-service-summary', requireAuth, async (req, res) => {
  try {
    const actor = req.session.user;
    const role = canonicalizeRole(actor?.role);

    if (role !== ROLE.EMPLOYEE) {
      return sendError(res, 403, 'Employee portal access is limited to employee accounts', 'FORBIDDEN');
    }

    if (!actor?.employee_id || !mongoose.Types.ObjectId.isValid(actor.employee_id)) {
      return sendError(res, 403, 'Employee account is not linked to an employee profile', 'FORBIDDEN');
    }

    const requestedDate = typeof req.query.date === 'string' && req.query.date.trim()
      ? req.query.date.trim()
      : new Date().toISOString().split('T')[0];

    if (!isIsoDateString(requestedDate)) {
      return sendError(res, 400, 'date must be in YYYY-MM-DD format', 'VALIDATION_ERROR');
    }

    const limitValue = req.query.limit === undefined ? 10 : Number(req.query.limit);
    if (!Number.isInteger(limitValue) || limitValue < 1 || limitValue > 20) {
      return sendError(res, 400, 'limit must be an integer between 1 and 20', 'VALIDATION_ERROR');
    }

    const employee = await Employee.findById(actor.employee_id)
      .populate('meal_plan_id', 'name')
      .populate('worker_category_id', 'name code');

    if (!employee) {
      return sendError(res, 404, 'Employee not found', 'NOT_FOUND');
    }

    const mealStatuses = await Promise.all(
      VALID_MEAL_TYPES.map((mealType) => getEmployeeMealStatus(employee, mealType, requestedDate))
    );

    const recentActivityDocs = await MealRecord.find({ employee_id: employee._id })
      .sort({ consumed_at: -1 })
      .limit(limitValue);

    const recentActivity = recentActivityDocs.map((record) => record.toJSON());
    const consumedToday = mealStatuses.filter((entry) => entry.status === 'consumed').length;
    const eligibleToday = mealStatuses.filter((entry) => entry.status === 'eligible').length;
    const remainingToday = mealStatuses.reduce((total, entry) => total + (entry.remaining || 0), 0);

    return res.json({
      employee: formatSelfServiceEmployee(employee),
      date: requestedDate,
      stats: {
        consumed_today: consumedToday,
        eligible_today: eligibleToday,
        remaining_today: remainingToday,
        recent_activity_count: recentActivity.length,
        last_activity_at: recentActivity[0]?.consumed_at || null,
        next_eligible_meal: mealStatuses.find((entry) => entry.status === 'eligible')?.meal_type || null
      },
      meal_statuses: mealStatuses,
      recent_activity: recentActivity
    });
  } catch (err) {
    console.error('Ticket self-service summary error:', err);
    return sendError(res, err.status || 500, err.message || 'Internal server error', err.code || 'INTERNAL_ERROR');
  }
});

router.post('/qr-token', requireAuth, async (req, res) => {
  try {
    const actor = req.session.user;
    const { employee_id, badge_number, ttl_seconds } = req.body || {};
    let delegationApproval = null;
    let delegationRequest = null;

    if (!employee_id && !badge_number) {
      await safeWriteAuditLog({
        actor_user_id: actor?.id,
        actor_role: actor?.role,
        action: 'ticket.qr.issue',
        entity_type: 'employee',
        entity_id: null,
        outcome: 'failure',
        reason: 'employee_id or badge_number is required',
        metadata: {}
      });
      return sendError(res, 400, 'employee_id or badge_number is required', 'VALIDATION_ERROR');
    }

    let employee;
    if (employee_id) {
      if (!mongoose.Types.ObjectId.isValid(employee_id)) {
        return sendError(res, 400, 'employee_id must be a valid id', 'VALIDATION_ERROR');
      }
      employee = await Employee.findById(employee_id);
    } else {
      employee = await Employee.findOne({ badge_number });
    }

    if (!employee) {
      await safeWriteAuditLog({
        actor_user_id: actor?.id,
        actor_role: actor?.role,
        action: 'ticket.qr.issue',
        entity_type: 'employee',
        entity_id: employee_id || badge_number || null,
        outcome: 'failure',
        reason: 'Employee not found',
        metadata: { employee_id: employee_id || null, badge_number: badge_number || null }
      });
      return sendError(res, 404, 'Employee not found', 'NOT_FOUND');
    }

    if (!canActorIssueQrTokenForEmployee(actor, employee)) {
      await safeWriteAuditLog({
        actor_user_id: actor?.id,
        actor_role: actor?.role,
        action: 'ticket.qr.issue',
        entity_type: 'employee',
        entity_id: employee.id,
        outcome: 'failure',
        reason: 'QR token issuance is only allowed for operational users or the linked employee profile',
        metadata: { employee_id: employee.id, badge_number: employee.badge_number }
      });
      return sendError(
        res,
        403,
        'QR token issuance is only allowed for operational users or the linked employee profile',
        'FORBIDDEN'
      );
    }

    try {
      assertEmployeeLifecycleActive(employee);
    } catch (err) {
      await safeWriteAuditLog({
        actor_user_id: actor?.id,
        actor_role: actor?.role,
        action: 'ticket.qr.issue',
        entity_type: 'employee',
        entity_id: employee.id,
        outcome: 'failure',
        reason: err.message,
        metadata: { employee_id: employee.id }
      });
      return sendError(res, err.status || 403, err.message || 'Employee is not active', err.code || 'FORBIDDEN');
    }

    let ttlSeconds = undefined;
    if (ttl_seconds !== undefined) {
      ttlSeconds = Number(ttl_seconds);
      if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > 86400) {
        return sendError(res, 400, 'ttl_seconds must be an integer between 1 and 86400', 'VALIDATION_ERROR');
      }
    }

    try {
      delegationRequest = await resolveDelegationRequest(req.body || {}, actor, employee);
    } catch (err) {
      await safeWriteAuditLog({
        actor_user_id: actor?.id,
        actor_role: actor?.role,
        action: 'ticket.qr.issue',
        entity_type: 'employee',
        entity_id: employee.id,
        outcome: 'failure',
        reason: err.message,
        metadata: { employee_id: employee.id, badge_number: employee.badge_number }
      });
      return sendError(res, err.status || 400, err.message || 'Invalid delegation request', err.code || 'VALIDATION_ERROR');
    }

    if (delegationRequest) {
      const effectiveTtlSeconds = Number(ttlSeconds || DEFAULT_TTL_SECONDS);
      delegationApproval = await DelegatedMealApproval.create({
        absent_employee_id: employee._id,
        collector_employee_id: delegationRequest.collector._id,
        approved_by_user_id: actor?.id || null,
        approved_by_role: actor?.role || null,
        approval_date: new Date().toISOString().split('T')[0],
        valid_until: new Date(Date.now() + (effectiveTtlSeconds * 1000)),
        meal_type: null,
        reason: delegationRequest.reason,
        notes: delegationRequest.notes,
        status: 'active'
      });
    }

    let tokenPayload;
    try {
      tokenPayload = await issueSignedQrToken(employee._id, ttlSeconds, {
        delegationApprovalId: delegationApproval?._id || null,
        collectorEmployeeId: delegationRequest?.collector?._id || null,
        issuedByUserId: actor?.id || null,
        issuedByRole: actor?.role || null,
        issuanceChannel: delegationRequest ? 'delegated_helpdesk' : 'standard',
        delegationReason: delegationRequest?.reason || null
      });
    } catch (err) {
      if (delegationApproval?._id) {
        await DelegatedMealApproval.findByIdAndUpdate(delegationApproval._id, { $set: { status: 'revoked' } });
      }
      throw err;
    }

    if (delegationApproval?._id) {
      await DelegatedMealApproval.findByIdAndUpdate(delegationApproval._id, {
        $set: { issued_token_jti: tokenPayload.token_jti }
      });
    }

    await safeWriteAuditLog({
      actor_user_id: actor?.id,
      actor_role: actor?.role,
      action: 'ticket.qr.issue',
      entity_type: 'employee',
      entity_id: employee.id,
      outcome: 'success',
      metadata: {
        employee_id: employee.id,
        expires_at: tokenPayload.expires_at,
        issuance_channel: delegationRequest ? 'delegated_helpdesk' : 'standard',
        delegation_approval_id: delegationApproval?.id || null,
        collector_employee_id: delegationRequest?.collector?.id || null,
        collector_badge_number: delegationRequest?.collector?.badge_number || null,
        delegation_reason: delegationRequest?.reason || null
      }
    });

    return res.status(201).json({
      token: tokenPayload.token,
      expires_at: tokenPayload.expires_at,
      ttl_seconds: tokenPayload.ttl_seconds,
      employee: employee.toJSON(),
      delegation: buildDelegationPayload(delegationRequest?.collector || null, delegationApproval)
    });
  } catch (err) {
    console.error('Ticket QR issue error:', err);
    return sendError(res, err.status || 500, err.message || 'Internal server error', err.code || 'INTERNAL_ERROR');
  }
});

router.get('/validate/:badge_number', requireVendorAccess, async (req, res) => {
  try {
    const { badge_number } = req.params;
    const { meal_type, date, canteen_location } = req.query;
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

    const eligibility = await validateConsumptionEligibility(employee, checkMealType, checkDate, {
      canteenLocation: canteen_location || null
    });
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
        canteen_location: canteen_location || null,
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

router.post('/validate-token', requireVendorAccess, async (req, res) => {
  try {
    const actor = req.session.user;
    const { token, meal_type, date, canteen_location } = req.body || {};

    const verified = await verifySignedQrToken(token);
    const employee = await Employee.findById(verified.employee_id);
    if (!employee) {
      await safeWriteAuditLog({
        actor_user_id: actor?.id,
        actor_role: actor?.role,
        action: 'ticket.validate',
        entity_type: 'employee',
        entity_id: verified.employee_id,
        outcome: 'failure',
        reason: 'Employee not found',
        metadata: { token_jti: verified.jti }
      });
      return sendError(res, 404, 'Employee not found', 'NOT_FOUND');
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
        metadata: { token_jti: verified.jti }
      });
      return sendError(res, err.status || 403, err.message || 'Employee is not active', err.code || 'FORBIDDEN');
    }

    let delegationContext = null;
    try {
      delegationContext = await loadDelegationContextOrThrow(verified, employee);
    } catch (err) {
      await safeWriteAuditLog({
        actor_user_id: actor?.id,
        actor_role: actor?.role,
        action: 'ticket.validate',
        entity_type: 'employee',
        entity_id: employee.id,
        outcome: 'failure',
        reason: err.message,
        metadata: { token_jti: verified.jti, delegation_approval_id: verified.delegation_approval_id || null }
      });
      return sendError(res, err.status || 403, err.message || 'Delegated collection is not valid', err.code || 'INVALID_DELEGATION');
    }

    const checkDate = date || new Date().toISOString().split('T')[0];
    const checkMealType = meal_type ? normalizeMealType(meal_type) : 'lunch';
    const eligibility = await validateConsumptionEligibility(employee, checkMealType, checkDate, {
      canteenLocation: canteen_location || null
    });
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
        token_jti: verified.jti,
        meal_type: checkMealType,
        date: checkDate,
        canteen_location: canteen_location || null,
        delegation_approval_id: delegationContext?.approval?.id || null,
        collector_employee_id: delegationContext?.collector?.id || null,
        allowed: balance.allowed,
        consumed: balance.consumed,
        remaining: Math.max((balance.allowed || 0) - (balance.consumed || 0), 0)
      }
    });

    return res.json({
      employee: employee.toJSON(),
      can_consume: eligibility.ok,
      already_consumed: eligibility.status === 409,
      meal_type: checkMealType,
      date: checkDate,
      allowed: balance.allowed,
      consumed: balance.consumed,
      remaining: Math.max((balance.allowed || 0) - (balance.consumed || 0), 0),
      message: eligibility.ok ? null : eligibility.error,
      delegation: buildDelegationPayload(delegationContext?.collector || null, delegationContext?.approval || null)
    });
  } catch (err) {
    console.error('Ticket validate-token error:', err);
    return sendError(res, err.status || 500, err.message || 'Internal server error', err.code || 'INTERNAL_ERROR');
  }
});

router.post('/consume', requireVendorAccess, async (req, res) => {
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
      token: normalizedToken,
      mealType: normalizedMealType,
      canteenLocation,
      notes,
      collectorBadgeNumber
    } = normalizedPayload;

    let verifiedQr = null;

    if (normalizedToken) {
      try {
        verifiedQr = await verifySignedQrToken(normalizedToken);
      } catch (err) {
        await safeWriteAuditLog({
          actor_user_id: actor?.id,
          actor_role: actor?.role,
          action: 'ticket.consume',
          entity_type: 'employee',
          entity_id: null,
          outcome: 'failure',
          reason: err.message,
          metadata: { token_present: true, meal_type: normalizedMealType }
        });
        return sendError(res, err.status || 401, err.message || 'Invalid QR token', err.code || 'INVALID_QR_TOKEN');
      }
    }

    let employee;
    try {
      employee = verifiedQr
        ? await Employee.findById(verifiedQr.employee_id)
        : await findEmployeeByBadgeOrThrow(normalizedBadge);

      if (!employee) {
        const notFoundError = new Error('Employee not found');
        notFoundError.status = 404;
        notFoundError.code = 'NOT_FOUND';
        throw notFoundError;
      }

      if (verifiedQr && normalizedBadge && employee.badge_number !== normalizedBadge) {
        const mismatchError = new Error('QR token does not match the supplied badge number');
        mismatchError.status = 409;
        mismatchError.code = 'VALIDATION_ERROR';
        throw mismatchError;
      }
    } catch (err) {
      await safeWriteAuditLog({
        actor_user_id: actor?.id,
        actor_role: actor?.role,
        action: 'ticket.consume',
        entity_type: 'employee',
        entity_id: verifiedQr?.employee_id || normalizedBadge,
        outcome: 'failure',
        reason: err.message,
        metadata: {
          badge_number: normalizedBadge || null,
          meal_type: normalizedMealType,
          token_jti: verifiedQr?.jti || null
        }
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
        metadata: {
          badge_number: employee.badge_number,
          meal_type: normalizedMealType,
          token_jti: verifiedQr?.jti || null
        }
      });
      return sendError(res, err.status || 403, err.message || 'Employee is not active', err.code || 'FORBIDDEN');
    }

    let delegationContext = null;
    try {
      delegationContext = await loadDelegationContextOrThrow(verifiedQr, employee);
      if (delegationContext && !collectorBadgeNumber) {
        throw makeRouteError('collector_badge_number is required for delegated collection', 400, 'VALIDATION_ERROR');
      }
      if (delegationContext && delegationContext.collector.badge_number !== collectorBadgeNumber) {
        throw makeRouteError('Collector badge does not match the approved delegated collector', 403, 'INVALID_DELEGATION');
      }
    } catch (err) {
      await safeWriteAuditLog({
        actor_user_id: actor?.id,
        actor_role: actor?.role,
        action: 'ticket.consume',
        entity_type: 'employee',
        entity_id: employee.id,
        outcome: 'failure',
        reason: err.message,
        metadata: {
          badge_number: employee.badge_number,
          collector_badge_number: collectorBadgeNumber || null,
          meal_type: normalizedMealType,
          token_jti: verifiedQr?.jti || null,
          delegation_approval_id: verifiedQr?.delegation_approval_id || null
        }
      });
      return sendError(res, err.status || 403, err.message || 'Delegated collection is not valid', err.code || 'INVALID_DELEGATION');
    }

    const today = new Date().toISOString().split('T')[0];
    const eligibility = await validateConsumptionEligibility(employee, normalizedMealType, today, {
      canteenLocation
    });
    if (!eligibility.ok) {
      await safeWriteAuditLog({
        actor_user_id: actor?.id,
        actor_role: actor?.role,
        action: 'ticket.consume',
        entity_type: 'employee',
        entity_id: employee.id,
        outcome: 'failure',
        reason: eligibility.error,
        metadata: {
          badge_number: employee.badge_number,
          meal_type: normalizedMealType,
          date: today,
          canteen_location: canteenLocation,
          token_jti: verifiedQr?.jti || null,
          delegation_approval_id: delegationContext?.approval?.id || null,
          collector_employee_id: delegationContext?.collector?.id || null
        }
      });
      return sendError(res, eligibility.status, eligibility.error, 'VALIDATION_ERROR');
    }

    if (verifiedQr) {
      try {
        await markQrTokenConsumed(verifiedQr.jti);
      } catch (err) {
        await safeWriteAuditLog({
          actor_user_id: actor?.id,
          actor_role: actor?.role,
          action: 'ticket.consume',
          entity_type: 'employee',
          entity_id: employee.id,
          outcome: 'failure',
          reason: err.message,
          metadata: {
            badge_number: employee.badge_number,
            meal_type: normalizedMealType,
            token_jti: verifiedQr.jti,
            delegation_approval_id: delegationContext?.approval?.id || null,
            collector_employee_id: delegationContext?.collector?.id || null
          }
        });
        return sendError(res, err.status || 409, err.message || 'QR token is no longer redeemable', err.code || 'CONSUMED_QR_TOKEN');
      }
    }

    const entitlementResult = await consumeEntitlement(employee, normalizedMealType, today);
    if (!entitlementResult.ok) {
      if (verifiedQr) {
        await resetQrTokenConsumption(verifiedQr.jti);
      }
      await safeWriteAuditLog({
        actor_user_id: actor?.id,
        actor_role: actor?.role,
        action: 'ticket.consume',
        entity_type: 'employee',
        entity_id: employee.id,
        outcome: 'failure',
        reason: entitlementResult.error,
        metadata: {
          badge_number: employee.badge_number,
          meal_type: normalizedMealType,
          date: today,
          token_jti: verifiedQr?.jti || null,
          delegation_approval_id: delegationContext?.approval?.id || null,
          collector_employee_id: delegationContext?.collector?.id || null
        }
      });
      return sendError(res, entitlementResult.status, entitlementResult.error, 'VALIDATION_ERROR');
    }

    let record = null;
    let transaction = null;
    const vendorUserId = req.session.user.id;
    const legacyStaffIdFallbackEnabled = isLegacyStaffIdFallbackEnabled();
    try {
      record = await MealRecord.create({
        employee_id: employee._id,
        meal_type: normalizedMealType,
        status: 'used',
        consumption_date: today,
        vendor_user_id: vendorUserId,
        collector_employee_id: delegationContext?.collector?._id || null,
        delegation_approval_id: delegationContext?.approval?._id || null,
        staff_id: legacyStaffIdFallbackEnabled ? vendorUserId : null,
        canteen_location: canteenLocation,
        notes
      });

      transaction = await createConsumptionTransaction({
        employeeId: employee._id,
        mealType: normalizedMealType,
        transactionDate: today,
        mealRecordId: record._id,
        canteenLocation,
        metadata: {
          employee_number: employee.employee_number,
          badge_number: employee.badge_number,
          token_jti: verifiedQr?.jti || null,
          delegation_approval_id: delegationContext?.approval?.id || null,
          collector_employee_id: delegationContext?.collector?.id || null,
          collector_badge_number: delegationContext?.collector?.badge_number || null,
          vendor_user_id: vendorUserId,
          staff_id: legacyStaffIdFallbackEnabled ? vendorUserId : null
        }
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
          badge_number: employee.badge_number,
          meal_type: normalizedMealType,
          date: today,
          remaining: entitlementResult.remaining,
          token_jti: verifiedQr?.jti || null,
          delegation_approval_id: delegationContext?.approval?.id || null,
          collector_employee_id: delegationContext?.collector?.id || null,
          collector_badge_number: delegationContext?.collector?.badge_number || null,
          transaction_reference: transaction.transaction_reference
        }
      });

      if (delegationContext?.approval?._id) {
        await DelegatedMealApproval.findByIdAndUpdate(delegationContext.approval._id, {
          $set: {
            status: 'consumed',
            consumed_at: new Date()
          }
        });
      }

      res.status(201).json({
        message: 'Meal recorded successfully',
        record: record.toJSON(),
        transaction: transaction.toJSON(),
        employee: employee.toJSON(),
        entitlement: entitlementResult.balance,
        remaining: entitlementResult.remaining,
        delegation: buildDelegationPayload(delegationContext?.collector || null, delegationContext?.approval || null)
      });
    } catch (insertErr) {
      if (insertErr.code === 11000) {
        if (verifiedQr) {
          await resetQrTokenConsumption(verifiedQr.jti);
        }
        await rollbackConsumption(employee, normalizedMealType, today);
        await safeWriteAuditLog({
          actor_user_id: actor?.id,
          actor_role: actor?.role,
          action: 'ticket.consume',
          entity_type: 'employee',
          entity_id: employee.id,
          outcome: 'failure',
          reason: 'Meal already recorded for this employee today',
          metadata: {
            badge_number: employee.badge_number,
            meal_type: normalizedMealType,
            date: today,
            token_jti: verifiedQr?.jti || null,
            delegation_approval_id: delegationContext?.approval?.id || null,
            collector_employee_id: delegationContext?.collector?.id || null
          }
        });
        return sendError(res, 409, 'Meal already recorded for this employee today', 'CONFLICT');
      }
      if (verifiedQr) {
        await resetQrTokenConsumption(verifiedQr.jti);
      }
      if (record && record._id) {
        await MealRecord.findByIdAndDelete(record._id);
      }
      await rollbackConsumption(employee, normalizedMealType, today);
      await safeWriteAuditLog({
        actor_user_id: actor?.id,
        actor_role: actor?.role,
        action: 'ticket.consume',
        entity_type: 'employee',
        entity_id: employee.id,
        outcome: 'failure',
        reason: 'Atomic consume transaction failed',
        metadata: {
          badge_number: employee.badge_number,
          meal_type: normalizedMealType,
          date: today,
          token_jti: verifiedQr?.jti || null,
          delegation_approval_id: delegationContext?.approval?.id || null,
          collector_employee_id: delegationContext?.collector?.id || null
        }
      });
      throw insertErr;
    }
  } catch (err) {
    console.error('Ticket consume error:', err);
    sendError(res, 500, 'Internal server error', 'INTERNAL_ERROR');
  }
});

router.get('/history', requireVendorAccess, async (req, res) => {
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
