const express = require('express');
const mongoose = require('mongoose');
const { requireAuth, requireReportViewer, requireVendorAccess } = require('../middleware/auth');
const { Employee, MealRecord, OfflineReconciliationBatch, Transaction } = require('../database');
const { safeWriteAuditLog } = require('../services/auditService');
const { sendError } = require('../utils/apiResponse');
const { getPagination, paginateArray } = require('../utils/pagination');
const { ROLE, canonicalizeRole } = require('../utils/roles');
const { buildVendorDailyReconciliation, buildVendorDailyDrilldown } = require('../services/reconciliationService');

const router = express.Router();

const VALID_MEAL_TYPES = new Set(['breakfast', 'lunch', 'dinner']);

function isIsoDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
}

function canReviewOfflineBatches(role) {
  const canonicalRole = canonicalizeRole(role);
  return canonicalRole === ROLE.ADMIN || canonicalRole === ROLE.VIEWER || canonicalRole === ROLE.HR;
}

function canViewOfflineBatch(actor, batch) {
  if (!actor || !batch) {
    return false;
  }

  const role = canonicalizeRole(actor.role);
  if (canReviewOfflineBatches(role)) {
    return true;
  }

  return (role === ROLE.VENDOR || role === ROLE.ADMIN)
    && batch.submitted_by_user_id
    && String(batch.submitted_by_user_id) === String(actor.id);
}

async function reconcileOfflineBatchEntries(redemptions, { batchDate, canteenLocation }) {
  const entries = [];
  let matchedEntries = 0;
  let unresolvedEntries = 0;
  let missingTransactionLinks = 0;
  let employeeNotFoundEntries = 0;
  let clientFailedEntries = 0;

  for (const item of redemptions) {
    const employee = await Employee.findOne({ badge_number: item.badge_number.trim() });
    const baseEntry = {
      local_reference: item.local_reference || null,
      badge_number: item.badge_number.trim(),
      meal_type: item.meal_type,
      queued_at: item.queued_at ? new Date(item.queued_at) : null,
      client_outcome: item.client_outcome,
      client_error: item.client_error || null,
      employee_id: employee?._id || null,
      employee_name: employee?.name || null,
      employee_number: employee?.employee_number || null,
      matched_meal_record_id: null,
      matched_transaction_id: null,
      matched_transaction_reference: null,
      status: 'unresolved',
      resolution_reason: null
    };

    if (item.client_outcome === 'sync_failed') {
      clientFailedEntries += 1;
    }

    if (!employee) {
      employeeNotFoundEntries += 1;
      unresolvedEntries += 1;
      entries.push({
        ...baseEntry,
        resolution_reason: 'Employee not found for badge number'
      });
      continue;
    }

    const matchedMealRecord = await MealRecord.findOne({
      employee_id: employee._id,
      meal_type: item.meal_type,
      consumption_date: batchDate,
      canteen_location: canteenLocation
    });

    if (!matchedMealRecord) {
      unresolvedEntries += 1;
      entries.push({
        ...baseEntry,
        resolution_reason: 'No confirmed meal record found for this offline redemption'
      });
      continue;
    }

    const matchedTransaction = await Transaction.findOne({ meal_record_id: matchedMealRecord._id })
      || await Transaction.findOne({
        employee_id: employee._id,
        transaction_date: batchDate,
        meal_type: item.meal_type,
        status: 'success'
      });

    if (matchedTransaction) {
      matchedEntries += 1;
      entries.push({
        ...baseEntry,
        matched_meal_record_id: matchedMealRecord._id,
        matched_transaction_id: matchedTransaction._id,
        matched_transaction_reference: matchedTransaction.transaction_reference,
        status: 'matched',
        resolution_reason: item.client_outcome === 'duplicate'
          ? 'Client marked this redemption as duplicate and the server already has a matching transaction'
          : 'Matched to a confirmed transaction'
      });
      continue;
    }

    missingTransactionLinks += 1;
    entries.push({
      ...baseEntry,
      matched_meal_record_id: matchedMealRecord._id,
      status: 'matched_without_transaction',
      resolution_reason: 'Matched meal record exists but no linked transaction reference was found'
    });
  }

  return {
    entries,
    summary: {
      total_entries: redemptions.length,
      matched_entries: matchedEntries,
      unresolved_entries: unresolvedEntries,
      missing_transaction_links: missingTransactionLinks,
      employee_not_found_entries: employeeNotFoundEntries,
      client_failed_entries: clientFailedEntries
    },
    status: unresolvedEntries || missingTransactionLinks || clientFailedEntries ? 'needs_review' : 'reconciled'
  };
}

router.post('/offline-batches', requireVendorAccess, async (req, res) => {
  try {
    const actor = req.session.user;
    const { device_id, device_label, batch_date, canteen_location, redemptions } = req.body || {};

    const normalizedDeviceId = typeof device_id === 'string' ? device_id.trim() : '';
    const normalizedDate = batch_date ? String(batch_date).trim() : new Date().toISOString().split('T')[0];
    const normalizedLocation = typeof canteen_location === 'string' && canteen_location.trim()
      ? canteen_location.trim()
      : 'Main Canteen';

    if (!normalizedDeviceId) {
      return sendError(res, 400, 'device_id is required', 'VALIDATION_ERROR');
    }

    if (!isIsoDateString(normalizedDate)) {
      return sendError(res, 400, 'batch_date must be in YYYY-MM-DD format', 'VALIDATION_ERROR');
    }

    if (!Array.isArray(redemptions) || redemptions.length === 0) {
      return sendError(res, 400, 'redemptions must contain at least one offline redemption entry', 'VALIDATION_ERROR');
    }

    for (const item of redemptions) {
      if (typeof item?.badge_number !== 'string' || !item.badge_number.trim()) {
        return sendError(res, 400, 'Each redemption requires a badge_number', 'VALIDATION_ERROR');
      }
      if (!VALID_MEAL_TYPES.has(item?.meal_type)) {
        return sendError(res, 400, 'Each redemption requires a valid meal_type', 'VALIDATION_ERROR');
      }
      if (item.client_outcome && !['synced', 'duplicate', 'sync_failed'].includes(item.client_outcome)) {
        return sendError(res, 400, 'client_outcome must be synced, duplicate, or sync_failed', 'VALIDATION_ERROR');
      }
    }

    const reconciliation = await reconcileOfflineBatchEntries(redemptions.map((item) => ({
      local_reference: item.local_reference || null,
      badge_number: item.badge_number,
      meal_type: item.meal_type,
      queued_at: item.queued_at || null,
      client_outcome: item.client_outcome || 'synced',
      client_error: item.client_error || null
    })), {
      batchDate: normalizedDate,
      canteenLocation: normalizedLocation
    });

    const batch = await OfflineReconciliationBatch.create({
      device_id: normalizedDeviceId,
      device_label: typeof device_label === 'string' && device_label.trim() ? device_label.trim() : null,
      batch_date: normalizedDate,
      canteen_location: normalizedLocation,
      submitted_by_user_id: actor?.id && mongoose.Types.ObjectId.isValid(actor.id) ? actor.id : null,
      submitted_by_role: actor?.role || null,
      status: reconciliation.status,
      summary: reconciliation.summary,
      entries: reconciliation.entries
    });

    await safeWriteAuditLog({
      actor_user_id: actor?.id,
      actor_role: actor?.role,
      action: 'reconciliation.offline_batch.submit',
      entity_type: 'offline_reconciliation_batch',
      entity_id: batch.id,
      outcome: 'success',
      metadata: {
        device_id: normalizedDeviceId,
        batch_date: normalizedDate,
        canteen_location: normalizedLocation,
        total_entries: reconciliation.summary.total_entries,
        status: reconciliation.status
      }
    });

    return res.status(201).json(batch.toJSON());
  } catch (err) {
    console.error('Reconciliation offline-batch submit error:', err);
    return sendError(res, err.status || 500, err.message || 'Internal server error', err.code || 'INTERNAL_ERROR');
  }
});

router.get('/offline-batches', requireAuth, async (req, res) => {
  try {
    const actor = req.session.user;
    const role = canonicalizeRole(actor?.role);

    if (![ROLE.ADMIN, ROLE.VENDOR, ROLE.VIEWER, ROLE.HR].includes(role)) {
      return sendError(res, 403, 'Offline reconciliation access is not available for this role', 'FORBIDDEN');
    }

    const filter = {};
    if (!canReviewOfflineBatches(role)) {
      filter.submitted_by_user_id = actor.id;
    }
    if (typeof req.query.date === 'string' && req.query.date.trim()) {
      if (!isIsoDateString(req.query.date.trim())) {
        return sendError(res, 400, 'date must be in YYYY-MM-DD format', 'VALIDATION_ERROR');
      }
      filter.batch_date = req.query.date.trim();
    }
    if (typeof req.query.status === 'string' && req.query.status.trim()) {
      filter.status = req.query.status.trim();
    }

    const batches = (await OfflineReconciliationBatch.find(filter)) || [];
    const sorted = [...batches].sort((left, right) => {
      const leftValue = new Date(left.created_at || 0).getTime();
      const rightValue = new Date(right.created_at || 0).getTime();
      return rightValue - leftValue;
    });

    const payload = sorted.map((batch) => batch.toJSON());
    const { hasPagination, page, limit } = getPagination(req.query);
    if (!hasPagination) {
      return res.json({ total: payload.length, batches: payload });
    }

    const paginated = paginateArray(payload, page, limit);
    return res.json({
      total: payload.length,
      batches: paginated.data,
      pagination: paginated.pagination
    });
  } catch (err) {
    console.error('Reconciliation offline-batches list error:', err);
    return sendError(res, err.status || 500, err.message || 'Internal server error', err.code || 'INTERNAL_ERROR');
  }
});

router.get('/offline-batches/:id', requireAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return sendError(res, 400, 'id must be a valid batch id', 'VALIDATION_ERROR');
    }

    const batch = await OfflineReconciliationBatch.findById(req.params.id);
    if (!batch) {
      return sendError(res, 404, 'Offline reconciliation batch not found', 'NOT_FOUND');
    }

    if (!canViewOfflineBatch(req.session.user, batch)) {
      return sendError(res, 403, 'You do not have access to this offline reconciliation batch', 'FORBIDDEN');
    }

    return res.json(batch.toJSON());
  } catch (err) {
    console.error('Reconciliation offline-batch detail error:', err);
    return sendError(res, err.status || 500, err.message || 'Internal server error', err.code || 'INTERNAL_ERROR');
  }
});

router.patch('/offline-batches/:id/review', requireReportViewer, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return sendError(res, 400, 'id must be a valid batch id', 'VALIDATION_ERROR');
    }

    const { status, review_notes } = req.body || {};
    if (!['reconciled', 'needs_review', 'rejected'].includes(status)) {
      return sendError(res, 400, 'status must be reconciled, needs_review, or rejected', 'VALIDATION_ERROR');
    }

    const batch = await OfflineReconciliationBatch.findByIdAndUpdate(req.params.id, {
      $set: {
        status,
        review_notes: typeof review_notes === 'string' && review_notes.trim() ? review_notes.trim() : null,
        reviewed_by_user_id: req.session.user?.id || null,
        reviewed_at: new Date()
      }
    }, { new: true });

    if (!batch) {
      return sendError(res, 404, 'Offline reconciliation batch not found', 'NOT_FOUND');
    }

    await safeWriteAuditLog({
      actor_user_id: req.session.user?.id,
      actor_role: req.session.user?.role,
      action: 'reconciliation.offline_batch.review',
      entity_type: 'offline_reconciliation_batch',
      entity_id: batch.id,
      outcome: 'success',
      metadata: { status }
    });

    return res.json(batch.toJSON());
  } catch (err) {
    console.error('Reconciliation offline-batch review error:', err);
    return sendError(res, err.status || 500, err.message || 'Internal server error', err.code || 'INTERNAL_ERROR');
  }
});

router.get('/vendor-daily', requireReportViewer, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const reconciliation = await buildVendorDailyReconciliation(date);
    const summary = reconciliation.summary || [];

    const { hasPagination, page, limit } = getPagination(req.query);
    if (!hasPagination) {
      return res.json({ date, total_vendors: summary.length, summary });
    }

    const paginated = paginateArray(summary, page, limit);
    return res.json({
      date,
      total_vendors: summary.length,
      summary: paginated.data,
      pagination: paginated.pagination
    });
  } catch (err) {
    console.error('Reconciliation vendor-daily error:', err);
    sendError(res, err.status || 500, err.message || 'Internal server error', err.code || 'INTERNAL_ERROR');
  }
});

router.get('/vendor-daily/drilldown', requireReportViewer, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const drilldown = await buildVendorDailyDrilldown({
      date,
      vendor_user_id: req.query.vendor_user_id,
      canteen_location: req.query.canteen_location
    });

    return res.json(drilldown);
  } catch (err) {
    console.error('Reconciliation vendor-daily drilldown error:', err);
    sendError(res, err.status || 500, err.message || 'Internal server error', err.code || 'INTERNAL_ERROR');
  }
});

module.exports = router;