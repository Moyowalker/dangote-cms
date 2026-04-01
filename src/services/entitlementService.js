const {
  MealPlan,
  Vendor,
  VendorRestriction,
  EntitlementPolicy,
  WorkerEntitlementBalance,
  MealRecord
} = require('../database');

const VALID_MEAL_TYPES = ['breakfast', 'lunch', 'dinner'];

async function getMealPlanAllowance(employeeRecord, mealType) {
  if (!employeeRecord.meal_plan_id) {
    return true;
  }

  const mealPlanId = typeof employeeRecord.meal_plan_id === 'object' && employeeRecord.meal_plan_id._id
    ? employeeRecord.meal_plan_id._id
    : employeeRecord.meal_plan_id;
  const mealPlan = await MealPlan.findById(mealPlanId);

  if (!mealPlan || mealPlan.active === false) {
    return false;
  }

  return Boolean(mealPlan[mealType]);
}

async function getDailyLimit(employeeRecord, mealType) {
  if (!employeeRecord.worker_category_id) {
    return 1;
  }

  const policy = await EntitlementPolicy.findOne({
    worker_category_id: employeeRecord.worker_category_id,
    meal_type: mealType,
    active: true
  });

  if (!policy) {
    return 1;
  }

  return policy.daily_limit;
}

async function ensureBalance(employeeRecord, mealType, date) {
  const allowed = await getDailyLimit(employeeRecord, mealType);

  const balance = await WorkerEntitlementBalance.findOneAndUpdate(
    { employee_id: employeeRecord._id, meal_type: mealType, balance_date: date },
    {
      $setOnInsert: {
        allowed,
        consumed: 0
      }
    },
    {
      upsert: true,
      new: true
    }
  );

  return balance;
}

async function validateVendorRestrictions(employeeRecord, mealType, canteenLocation) {
  if (!canteenLocation || !employeeRecord.worker_category_id) {
    return { ok: true };
  }

  const vendors = await Vendor.find({ canteen_location: canteenLocation, active: true });
  if (!vendors || vendors.length === 0) {
    return { ok: true };
  }

  const vendorIds = vendors.map((vendor) => vendor._id);
  const activeRestrictions = await VendorRestriction.find({ vendor_id: { $in: vendorIds }, active: true });
  if (!activeRestrictions || activeRestrictions.length === 0) {
    return { ok: true };
  }

  const allowed = activeRestrictions.some(
    (restriction) =>
      String(restriction.worker_category_id) === String(employeeRecord.worker_category_id)
      && restriction.meal_type === mealType
  );

  if (!allowed) {
    return {
      ok: false,
      status: 403,
      error: 'Vendor restriction does not allow this worker category for the selected meal type'
    };
  }

  return { ok: true };
}

async function validateDuplicateWindow(employeeRecord, mealType, date) {
  const configured = Number(process.env.DUPLICATE_WINDOW_MINUTES || 2);
  const duplicateWindowMinutes = Number.isFinite(configured) && configured > 0 ? configured : 2;
  const cutoff = new Date(Date.now() - (duplicateWindowMinutes * 60 * 1000));

  const recent = await MealRecord.findOne({
    employee_id: employeeRecord._id,
    meal_type: mealType,
    consumed_at: { $gte: cutoff }
  });

  if (!recent) {
    return { ok: true };
  }

  if (String(recent.consumption_date) !== String(date)) {
    return {
      ok: false,
      status: 409,
      error: 'Duplicate redemption attempt blocked by duplicate window'
    };
  }

  return { ok: true };
}

async function validateConsumptionEligibility(employeeRecord, mealType, date, options = {}) {
  if (!VALID_MEAL_TYPES.includes(mealType)) {
    return { ok: false, status: 400, error: `meal_type must be one of: ${VALID_MEAL_TYPES.join(', ')}` };
  }

  const allowedByPlan = await getMealPlanAllowance(employeeRecord, mealType);
  if (!allowedByPlan) {
    return { ok: false, status: 403, error: 'Employee meal plan does not allow this meal type' };
  }

  const existing = await MealRecord.findOne({
    employee_id: employeeRecord._id,
    meal_type: mealType,
    consumption_date: date
  });

  if (existing) {
    return { ok: false, status: 409, error: 'Meal already recorded for this employee today' };
  }

  const duplicateWindowCheck = await validateDuplicateWindow(employeeRecord, mealType, date);
  if (!duplicateWindowCheck.ok) {
    return duplicateWindowCheck;
  }

  const vendorRestrictionCheck = await validateVendorRestrictions(employeeRecord, mealType, options.canteenLocation);
  if (!vendorRestrictionCheck.ok) {
    return vendorRestrictionCheck;
  }

  const balance = await ensureBalance(employeeRecord, mealType, date);
  const remaining = Math.max(balance.allowed - balance.consumed, 0);

  if (remaining <= 0) {
    return {
      ok: false,
      status: 403,
      error: 'No remaining entitlement for this meal type today',
      balance: balance.toJSON()
    };
  }

  return {
    ok: true,
    status: 200,
    balance: balance.toJSON(),
    remaining
  };
}

async function consumeEntitlement(employeeRecord, mealType, date) {
  const updated = await WorkerEntitlementBalance.findOneAndUpdate(
    {
      employee_id: employeeRecord._id,
      meal_type: mealType,
      balance_date: date,
      $expr: { $lt: ['$consumed', '$allowed'] }
    },
    { $inc: { consumed: 1 } },
    { new: true }
  );

  if (!updated) {
    return {
      ok: false,
      status: 403,
      error: 'No remaining entitlement for this meal type today'
    };
  }

  return {
    ok: true,
    status: 200,
    balance: updated.toJSON(),
    remaining: Math.max(updated.allowed - updated.consumed, 0)
  };
}

async function rollbackConsumption(employeeRecord, mealType, date) {
  await WorkerEntitlementBalance.findOneAndUpdate(
    {
      employee_id: employeeRecord._id,
      meal_type: mealType,
      balance_date: date,
      consumed: { $gt: 0 }
    },
    { $inc: { consumed: -1 } }
  );
}

async function getEmployeeMealStatus(employeeRecord, mealType, date) {
  if (!VALID_MEAL_TYPES.includes(mealType)) {
    throw new Error(`meal_type must be one of: ${VALID_MEAL_TYPES.join(', ')}`);
  }

  const allowedByPlan = await getMealPlanAllowance(employeeRecord, mealType);
  const existing = await MealRecord.findOne({
    employee_id: employeeRecord._id,
    meal_type: mealType,
    consumption_date: date
  });
  const balance = await WorkerEntitlementBalance.findOne({
    employee_id: employeeRecord._id,
    meal_type: mealType,
    balance_date: date
  });

  const allowed = balance ? balance.allowed : await getDailyLimit(employeeRecord, mealType);
  const consumed = Math.max(balance ? balance.consumed : 0, existing ? 1 : 0);
  const remaining = allowedByPlan ? Math.max(allowed - consumed, 0) : 0;

  if (!allowedByPlan) {
    return {
      meal_type: mealType,
      status: 'not_in_plan',
      can_consume: false,
      allowed,
      consumed,
      remaining,
      consumed_at: existing?.consumed_at || null,
      message: 'Your meal plan does not cover this meal today.'
    };
  }

  if (existing) {
    return {
      meal_type: mealType,
      status: 'consumed',
      can_consume: false,
      allowed,
      consumed,
      remaining,
      consumed_at: existing.consumed_at,
      message: 'Already redeemed today.'
    };
  }

  if (remaining <= 0) {
    return {
      meal_type: mealType,
      status: 'exhausted',
      can_consume: false,
      allowed,
      consumed,
      remaining,
      consumed_at: null,
      message: 'No remaining entitlement for this meal today.'
    };
  }

  return {
    meal_type: mealType,
    status: 'eligible',
    can_consume: true,
    allowed,
    consumed,
    remaining,
    consumed_at: null,
    message: 'Available for redemption.'
  };
}

const getWorkerMealStatus = getEmployeeMealStatus;

module.exports = {
  VALID_MEAL_TYPES,
  validateConsumptionEligibility,
  consumeEntitlement,
  rollbackConsumption,
  getEmployeeMealStatus,
  getWorkerMealStatus
};
