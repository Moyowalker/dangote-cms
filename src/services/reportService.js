const mongoose = require('mongoose');
const { Employee, MealRecord, AuditLog, Transaction } = require('../database');

function makeError(message, status = 400, code = 'VALIDATION_ERROR') {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function isValidDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function buildDateFilter({ date, start_date, end_date }) {
  if (date) {
    return { consumption_date: date };
  }

  if (start_date || end_date) {
    const filter = {};
    if (start_date) filter.$gte = start_date;
    if (end_date) filter.$lte = end_date;
    return { consumption_date: filter };
  }

  return { consumption_date: new Date().toISOString().split('T')[0] };
}

function getSelectedDate({ date, start_date, end_date }) {
  if (date) return date;
  if (start_date || end_date) {
    return `${start_date || ''}${start_date || end_date ? '...' : ''}${end_date || ''}`;
  }
  return new Date().toISOString().split('T')[0];
}

function getAuditEntryDate(entry) {
  if (entry?.metadata?.date && isValidDateString(String(entry.metadata.date))) {
    return String(entry.metadata.date);
  }

  if (entry?.created_at instanceof Date) {
    return entry.created_at.toISOString().split('T')[0];
  }

  return String(entry?.created_at || '').split('T')[0] || null;
}

function matchesSelectedDate(entryDate, { date, start_date, end_date }) {
  if (!entryDate) {
    return false;
  }

  if (date) {
    return entryDate === date;
  }

  if (start_date && entryDate < start_date) {
    return false;
  }

  if (end_date && entryDate > end_date) {
    return false;
  }

  if (start_date || end_date) {
    return true;
  }

  return entryDate === new Date().toISOString().split('T')[0];
}

async function buildDailyReport(query) {
  const {
    date,
    start_date,
    end_date,
    vendor,
    worker_category_id,
    status
  } = query;

  if (date && !isValidDateString(date)) {
    throw makeError('date must be in YYYY-MM-DD format');
  }
  if (start_date && !isValidDateString(start_date)) {
    throw makeError('start_date must be in YYYY-MM-DD format');
  }
  if (end_date && !isValidDateString(end_date)) {
    throw makeError('end_date must be in YYYY-MM-DD format');
  }
  if (status && !['used', 'voided'].includes(status)) {
    throw makeError('status must be one of: used, voided');
  }
  if (worker_category_id && !mongoose.Types.ObjectId.isValid(worker_category_id)) {
    throw makeError('worker_category_id must be a valid id');
  }

  const dateFilter = buildDateFilter({ date, start_date, end_date });
  const employeeFilter = {};
  if (worker_category_id) {
    employeeFilter.worker_category_id = worker_category_id;
  }

  let employeeIds = null;
  if (Object.keys(employeeFilter).length > 0) {
    const employees = await Employee.find(employeeFilter);
    employeeIds = employees.map((employee) => employee._id);
    if (employeeIds.length === 0) {
      return {
        date: getSelectedDate({ date, start_date, end_date }),
        summary: [],
        details: []
      };
    }
  }

  const mealFilter = { ...dateFilter };
  if (vendor) mealFilter.canteen_location = vendor;
  if (status) mealFilter.status = status;
  if (employeeIds) mealFilter.employee_id = { $in: employeeIds };

  const records = await MealRecord.find(mealFilter)
    .populate('employee_id', 'name department employee_number')
    .sort({ meal_type: 1 });

  const mealRecordIds = records.map((record) => String(record._id || record.id)).filter(Boolean);
  const transactions = mealRecordIds.length > 0
    ? await Transaction.find({ meal_record_id: { $in: mealRecordIds } })
    : [];
  const transactionByMealRecordId = new Map(
    transactions
      .filter((transaction) => transaction.meal_record_id)
      .map((transaction) => [String(transaction.meal_record_id), transaction])
  );

  const details = records.map((r) => {
    const transaction = transactionByMealRecordId.get(String(r._id || r.id));
    return {
      ...r.toJSON(),
      employee_name: r.employee_id && typeof r.employee_id === 'object' ? r.employee_id.name : null,
      department: r.employee_id && typeof r.employee_id === 'object' ? r.employee_id.department : null,
      employee_number: r.employee_id && typeof r.employee_id === 'object' ? r.employee_id.employee_number : null,
      employee_id: r.employee_id && typeof r.employee_id === 'object'
        ? (r.employee_id._id ? r.employee_id._id.toString() : r.employee_id.id)
        : String(r.employee_id || '') || null,
      transaction_reference: transaction ? transaction.transaction_reference : null,
      transaction_id: transaction ? String(transaction._id || transaction.id) : null,
      has_transaction_link: Boolean(transaction)
    };
  });

  const summaryMap = new Map();
  for (const record of details) {
    const key = record.meal_type;
    summaryMap.set(key, (summaryMap.get(key) || 0) + 1);
  }

  const summary = [...summaryMap.entries()].map(([meal_type, count]) => ({ meal_type, count }));

  return {
    date: getSelectedDate({ date, start_date, end_date }),
    summary,
    details
  };
}

async function buildFailureReport(query) {
  const {
    date,
    start_date,
    end_date,
    vendor,
    reason
  } = query;

  if (date && !isValidDateString(date)) {
    throw makeError('date must be in YYYY-MM-DD format');
  }
  if (start_date && !isValidDateString(start_date)) {
    throw makeError('start_date must be in YYYY-MM-DD format');
  }
  if (end_date && !isValidDateString(end_date)) {
    throw makeError('end_date must be in YYYY-MM-DD format');
  }
  if (reason !== undefined && typeof reason !== 'string') {
    throw makeError('reason must be a string');
  }

  const normalizedReason = typeof reason === 'string' ? reason.trim().toLowerCase() : '';
  const records = await AuditLog.find({ action: 'ticket.consume', outcome: 'failure' });

  const filtered = records.filter((entry) => {
    const entryDate = getAuditEntryDate(entry);
    if (!matchesSelectedDate(entryDate, { date, start_date, end_date })) {
      return false;
    }

    const location = String(entry.metadata?.canteen_location || '');
    if (vendor && location !== vendor) {
      return false;
    }

    if (normalizedReason && !String(entry.reason || '').toLowerCase().includes(normalizedReason)) {
      return false;
    }

    return true;
  });

  const details = filtered
    .map((entry) => ({
      id: entry.id,
      created_at: entry.created_at,
      date: getAuditEntryDate(entry),
      reason: entry.reason || 'Unknown failure',
      badge_number: entry.metadata?.badge_number || null,
      meal_type: entry.metadata?.meal_type || null,
      canteen_location: entry.metadata?.canteen_location || 'Unknown',
      actor_role: entry.actor_role || null,
      actor_user_id: entry.actor_user_id ? String(entry.actor_user_id) : null,
      entity_id: entry.entity_id || null
    }))
    .sort((left, right) => {
      const leftTime = new Date(left.created_at || 0).getTime();
      const rightTime = new Date(right.created_at || 0).getTime();
      return rightTime - leftTime;
    });

  const summaryMap = new Map();
  for (const detail of details) {
    summaryMap.set(detail.reason, (summaryMap.get(detail.reason) || 0) + 1);
  }

  const summary = [...summaryMap.entries()]
    .map(([reasonText, count]) => ({ reason: reasonText, count }))
    .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason));

  return {
    date: getSelectedDate({ date, start_date, end_date }),
    summary,
    details
  };
}

module.exports = {
  buildDailyReport,
  buildFailureReport,
  isValidDateString,
  makeError
};
