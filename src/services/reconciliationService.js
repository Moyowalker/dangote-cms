const { MealRecord, AuditLog } = require('../database');

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

async function buildVendorDailyReconciliation(date) {
  if (!validateDate(date)) {
    throw makeError('date must be in YYYY-MM-DD format');
  }

  const records = await MealRecord.find({ consumption_date: date });
  const failures = await AuditLog.find({ action: 'ticket.consume', outcome: 'failure' });

  const successByVendor = new Map();
  const failureByVendor = new Map();

  for (const record of records) {
    const vendorId = record.staff_id ? String(record.staff_id) : 'unknown';
    const key = `${vendorId}::${record.canteen_location || 'Main Canteen'}`;
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

module.exports = {
  buildVendorDailyReconciliation,
  validateDate,
  indicatorForFailureRate,
  makeError
};
