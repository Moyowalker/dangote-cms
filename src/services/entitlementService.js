const {
  MealPlan,
  EntitlementPolicy,
  WorkerEntitlementBalance,
  MealRecord
} = require('../database');

const VALID_MEAL_TYPES = ['breakfast', 'lunch', 'dinner'];

async function getMealPlanAllowance(employee, mealType) {
  if (!employee.meal_plan_id) {
    return true;
  }

  const mealPlanId = typeof employee.meal_plan_id === 'object' && employee.meal_plan_id._id
    ? employee.meal_plan_id._id
    : employee.meal_plan_id;
  const mealPlan = await MealPlan.findById(mealPlanId);

  if (!mealPlan || mealPlan.active === false) {
    return false;
  }

  return Boolean(mealPlan[mealType]);
}

async function getDailyLimit(employee, mealType) {
  if (!employee.worker_category_id) {
    return 1;
  }

  const policy = await EntitlementPolicy.findOne({
    worker_category_id: employee.worker_category_id,
    meal_type: mealType,
    active: true
  });

  if (!policy) {
    return 1;
  }

  return policy.daily_limit;
}

async function ensureBalance(employee, mealType, date) {
  const allowed = await getDailyLimit(employee, mealType);

  const balance = await WorkerEntitlementBalance.findOneAndUpdate(
    { employee_id: employee._id, meal_type: mealType, balance_date: date },
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

async function validateConsumptionEligibility(employee, mealType, date) {
  if (!VALID_MEAL_TYPES.includes(mealType)) {
    return { ok: false, status: 400, error: `meal_type must be one of: ${VALID_MEAL_TYPES.join(', ')}` };
  }

  const allowedByPlan = await getMealPlanAllowance(employee, mealType);
  if (!allowedByPlan) {
    return { ok: false, status: 403, error: 'Employee meal plan does not allow this meal type' };
  }

  const existing = await MealRecord.findOne({
    employee_id: employee._id,
    meal_type: mealType,
    consumption_date: date
  });

  if (existing) {
    return { ok: false, status: 409, error: 'Meal already recorded for this employee today' };
  }

  const balance = await ensureBalance(employee, mealType, date);
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

async function consumeEntitlement(employee, mealType, date) {
  const updated = await WorkerEntitlementBalance.findOneAndUpdate(
    {
      employee_id: employee._id,
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

async function rollbackConsumption(employee, mealType, date) {
  await WorkerEntitlementBalance.findOneAndUpdate(
    {
      employee_id: employee._id,
      meal_type: mealType,
      balance_date: date,
      consumed: { $gt: 0 }
    },
    { $inc: { consumed: -1 } }
  );
}

module.exports = {
  VALID_MEAL_TYPES,
  validateConsumptionEligibility,
  consumeEntitlement,
  rollbackConsumption
};
