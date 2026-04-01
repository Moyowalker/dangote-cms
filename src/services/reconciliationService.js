const { MealRecord, AuditLog, Employee, Transaction } = require('../database');

function makeError(message, status = 400, code = 'VALIDATION_ERROR') {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function validateDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function indicatorForFailureRate(failures, total) {
  if (failures === 0) return 'none';
  const denominator = total > 0 ? total : 1;
  const rate = failures / denominator;
  if (rate >= 0.5 || failures >= 5) return 'high';
  if (rate >= 0.2 || failures >= 2) return 'medium';
  return 'low';
}

function getTimeValue(value) {
  const time = value ? new Date(value).getTime() : Number.NaN;
  return Number.isNaN(time) ? 0 : time;
}

function getFailureFollowUpStatus({ failure, matchedConsumption }) {
  if (!matchedConsumption) {
    return 'unresolved';
  }

  const failureTime = getTimeValue(failure.created_at);
  const consumptionTime = getTimeValue(matchedConsumption.consumed_at || matchedConsumption.transaction_created_at);
  return consumptionTime >= failureTime ? 'confirmed-after-failure' : 'already-confirmed-before-failure';
}

function getVendorOperatorIdFromMealRecord(record) {
  const vendorOperatorId = record.vendor_user_id || record.staff_id;
  return vendorOperatorId ? String(vendorOperatorId) : 'unknown';
}

function buildVendorOperatorMealRecordFilter({ date, vendorUserId, canteenLocation }) {
  return {
    consumption_date: date,
    $or: [
      { vendor_user_id: vendorUserId },
      { staff_id: vendorUserId }
    ],
    canteen_location: canteenLocation
  };
}

async function buildVendorDailyReconciliation(date) {
  if (!validateDate(date)) {
    throw makeError('date must be in YYYY-MM-DD format');
  }

  const records = await MealRecord.find({ consumption_date: date });
  const failures = await AuditLog.find({ action: 'ticket.consume', outcome: 'failure' });

  const successByVendor = new Map();
  const failureByVendor = new Map();

  for (const record of records) {
    const vendorUserId = getVendorOperatorIdFromMealRecord(record);
    const key = `${vendorUserId}::${record.canteen_location || 'Main Canteen'}`;
    successByVendor.set(key, (successByVendor.get(key) || 0) + 1);
  }

  for (const log of failures) {
    const logDate = log.metadata && log.metadata.date ? String(log.metadata.date) : null;
    if (logDate !== date) continue;
    const vendorId = log.actor_user_id ? String(log.actor_user_id) : 'unknown';
    const key = `${vendorId}::${(log.metadata && log.metadata.canteen_location) || 'Main Canteen'}`;
    failureByVendor.set(key, (failureByVendor.get(key) || 0) + 1);
  }

  const keys = new Set([...successByVendor.keys(), ...failureByVendor.keys()]);
  const summary = [];

  for (const key of keys) {
    const [vendor_user_id, canteen_location] = key.split('::');
    const total_consumptions = successByVendor.get(key) || 0;
    const failed_attempts = failureByVendor.get(key) || 0;

    summary.push({
      vendor_user_id,
      canteen_location,
      date,
      total_consumptions,
      failed_attempts,
      discrepancy_indicator: indicatorForFailureRate(failed_attempts, total_consumptions)
    });
  }

  summary.sort((a, b) => b.failed_attempts - a.failed_attempts || b.total_consumptions - a.total_consumptions);

  return { date, summary };
}

async function buildVendorDailyDrilldown({ date, vendor_user_id, canteen_location }) {
  if (!validateDate(date)) {
    throw makeError('date must be in YYYY-MM-DD format');
  }

  if (!vendor_user_id || typeof vendor_user_id !== 'string') {
    throw makeError('vendor_user_id is required');
  }

  if (!canteen_location || typeof canteen_location !== 'string') {
    throw makeError('canteen_location is required');
  }

  const normalizedVendorUserId = String(vendor_user_id).trim();
  const normalizedLocation = String(canteen_location).trim();

  if (!normalizedVendorUserId) {
    throw makeError('vendor_user_id is required');
  }

  if (!normalizedLocation) {
    throw makeError('canteen_location is required');
  }

  const [records, failures] = await Promise.all([
    MealRecord.find(buildVendorOperatorMealRecordFilter({
      date,
      vendorUserId: normalizedVendorUserId,
      canteenLocation: normalizedLocation
    })).sort({ consumed_at: -1 }),
    AuditLog.find({
      action: 'ticket.consume',
      outcome: 'failure',
      actor_user_id: normalizedVendorUserId
    }).sort({ created_at: -1 })
  ]);

  const matchingFailures = failures.filter((log) => {
    const logDate = log.metadata && log.metadata.date ? String(log.metadata.date) : null;
    const logLocation = (log.metadata && log.metadata.canteen_location) || 'Main Canteen';
    return logDate === date && logLocation === normalizedLocation;
  });

  const employeeIds = [...new Set(records.map((record) => String(record.employee_id)).filter(Boolean))];
  const mealRecordIds = [...new Set(records.map((record) => String(record._id || record.id)).filter(Boolean))];
  const employees = employeeIds.length > 0
    ? await Employee.find({ _id: { $in: employeeIds } })
    : [];
  const transactions = mealRecordIds.length > 0
    ? await Transaction.find({ meal_record_id: { $in: mealRecordIds } })
    : [];
  const employeeById = new Map(employees.map((employee) => [String(employee._id || employee.id), employee]));
  const transactionByMealRecordId = new Map(
    transactions
      .filter((transaction) => transaction.meal_record_id)
      .map((transaction) => [String(transaction.meal_record_id), transaction])
  );

  const successful_consumptions = records.map((record) => {
    const employee = employeeById.get(String(record.employee_id));
    const transaction = transactionByMealRecordId.get(String(record._id || record.id));
    return {
      id: record.id || String(record._id),
      employee_id: String(record.employee_id),
      employee_name: employee ? employee.name : null,
      employee_number: employee ? employee.employee_number : null,
      badge_number: employee ? employee.badge_number : null,
      department: employee ? employee.department : null,
      meal_type: record.meal_type,
      consumed_at: record.consumed_at,
      notes: record.notes || null,
      transaction_id: transaction ? String(transaction._id || transaction.id) : null,
      transaction_reference: transaction ? transaction.transaction_reference : null,
      transaction_created_at: transaction ? transaction.created_at : null,
      has_transaction_link: Boolean(transaction)
    };
  });

  const failed_attempts = matchingFailures.map((log) => {
    const baseFailure = {
      id: log.id || String(log._id),
      created_at: log.created_at,
      reason: log.reason || 'Unknown failure',
      badge_number: log.metadata?.badge_number || null,
      meal_type: log.metadata?.meal_type || null,
      entity_id: log.entity_id || null,
      actor_role: log.actor_role || null
    };

    const matchedConsumption = successful_consumptions.find((record) => {
      if (baseFailure.meal_type && record.meal_type !== baseFailure.meal_type) {
        return false;
      }

      if (baseFailure.badge_number && record.badge_number === baseFailure.badge_number) {
        return true;
      }

      return baseFailure.entity_id && record.employee_id === String(baseFailure.entity_id);
    }) || null;

    return {
      ...baseFailure,
      follow_up_status: getFailureFollowUpStatus({ failure: baseFailure, matchedConsumption }),
      matched_consumption_id: matchedConsumption ? matchedConsumption.id : null,
      matched_consumed_at: matchedConsumption ? matchedConsumption.consumed_at : null,
      matched_transaction_reference: matchedConsumption ? matchedConsumption.transaction_reference : null,
      has_matching_consumption: Boolean(matchedConsumption)
    };
  });

  const duplicate_window_blocks = failed_attempts.filter((entry) => String(entry.reason || '').toLowerCase().includes('duplicate')).length;
  const already_recorded_failures = failed_attempts.filter((entry) => String(entry.reason || '').toLowerCase().includes('already recorded')).length;
  const consumptions_with_transaction = successful_consumptions.filter((entry) => entry.has_transaction_link).length;
  const missing_transaction_links = successful_consumptions.length - consumptions_with_transaction;
  const failures_with_confirmed_match = failed_attempts.filter((entry) => entry.has_matching_consumption).length;
  const failures_confirmed_after_failure = failed_attempts.filter((entry) => entry.follow_up_status === 'confirmed-after-failure').length;
  const unresolved_failed_attempts = failed_attempts.filter((entry) => entry.follow_up_status === 'unresolved').length;

  return {
    date,
    vendor_user_id: normalizedVendorUserId,
    canteen_location: normalizedLocation,
    summary: {
      total_consumptions: successful_consumptions.length,
      consumptions_with_transaction,
      missing_transaction_links,
      failed_attempts: failed_attempts.length,
      failures_with_confirmed_match,
      failures_confirmed_after_failure,
      unresolved_failed_attempts,
      duplicate_window_blocks,
      already_recorded_failures,
      discrepancy_indicator: indicatorForFailureRate(failed_attempts.length, successful_consumptions.length)
    },
    successful_consumptions,
    failed_attempts
  };
}

module.exports = {
  buildVendorDailyReconciliation,
  buildVendorDailyDrilldown,
  validateDate,
  indicatorForFailureRate,
  makeError
};
