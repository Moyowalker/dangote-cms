process.env.NODE_ENV = 'test';

jest.mock('../../src/database');

const {
  initializeDatabase,
  closeDatabase,
  Employee,
  MealPlan,
  MealRecord,
  WorkerCategory,
  Vendor,
  VendorRestriction,
  EntitlementPolicy,
  WorkerEntitlementBalance
} = require('../../src/database');

const {
  validateConsumptionEligibility,
  consumeEntitlement,
  VALID_MEAL_TYPES
} = require('../../src/services/entitlementService');

describe('Entitlement Service Unit Tests', () => {
  beforeAll(async () => {
    await initializeDatabase();
  });

  beforeEach(async () => {
    await MealRecord.deleteMany({});
    await WorkerEntitlementBalance.deleteMany({});
    await EntitlementPolicy.deleteMany({});
    await VendorRestriction.deleteMany({});
    await Vendor.deleteMany({});
    await WorkerCategory.deleteMany({});
    await MealPlan.deleteMany({});
    await Employee.deleteMany({});
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test('returns validation error for unsupported meal type', async () => {
    const employee = await Employee.create({
      employee_number: 'UT001',
      name: 'Unit Test User',
      department: 'QA',
      badge_number: 'UT-BADGE-1'
    });

    const result = await validateConsumptionEligibility(employee, 'snack', '2026-03-22');
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.error).toBe(`meal_type must be one of: ${VALID_MEAL_TYPES.join(', ')}`);
  });

  test('enforces meal plan restriction checks', async () => {
    const plan = await MealPlan.create({
      name: 'Lunch Disabled Plan',
      breakfast: true,
      lunch: false,
      dinner: false,
      active: true
    });

    const employee = await Employee.create({
      employee_number: 'UT002',
      name: 'Restriction User',
      department: 'Ops',
      badge_number: 'UT-BADGE-2',
      meal_plan_id: plan._id
    });

    const result = await validateConsumptionEligibility(employee, 'lunch', '2026-03-22');
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
    expect(result.error).toBe('Employee meal plan does not allow this meal type');
  });

  test('blocks duplicate meal consumption for the same day', async () => {
    const employee = await Employee.create({
      employee_number: 'UT003',
      name: 'Duplicate User',
      department: 'Ops',
      badge_number: 'UT-BADGE-3'
    });

    await MealRecord.create({
      employee_id: employee._id,
      meal_type: 'lunch',
      status: 'used',
      consumption_date: '2026-03-22'
    });

    const result = await validateConsumptionEligibility(employee, 'lunch', '2026-03-22');
    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
    expect(result.error).toBe('Meal already recorded for this employee today');
  });

  test('supports entitlement deduction and rejects when daily limit is exhausted', async () => {
    const category = await WorkerCategory.create({
      code: 'UT-CAT',
      name: 'Unit Category'
    });

    await EntitlementPolicy.create({
      worker_category_id: category._id,
      meal_type: 'lunch',
      daily_limit: 1,
      active: true
    });

    const employee = await Employee.create({
      employee_number: 'UT004',
      name: 'Deduction User',
      department: 'Ops',
      badge_number: 'UT-BADGE-4',
      worker_category_id: category._id
    });

    const eligibility = await validateConsumptionEligibility(employee, 'lunch', '2026-03-22');
    expect(eligibility.ok).toBe(true);
    expect(eligibility.remaining).toBe(1);

    const firstConsume = await consumeEntitlement(employee, 'lunch', '2026-03-22');
    expect(firstConsume.ok).toBe(true);
    expect(firstConsume.remaining).toBe(0);

    const secondConsume = await consumeEntitlement(employee, 'lunch', '2026-03-22');
    expect(secondConsume.ok).toBe(false);
    expect(secondConsume.status).toBe(403);
    expect(secondConsume.error).toBe('No remaining entitlement for this meal type today');
  });

  test('enforces vendor restriction checks for worker category and meal type', async () => {
    const allowedCategory = await WorkerCategory.create({ code: 'UT-ALLOW', name: 'Allowed Category' });
    const blockedCategory = await WorkerCategory.create({ code: 'UT-BLOCK', name: 'Blocked Category' });
    const vendor = await Vendor.create({ code: 'VEND-1', name: 'Main Vendor', canteen_location: 'Main Canteen', active: true });

    await VendorRestriction.create({
      vendor_id: vendor._id,
      worker_category_id: allowedCategory._id,
      meal_type: 'lunch',
      active: true
    });

    const blockedEmployee = await Employee.create({
      employee_number: 'UT005',
      name: 'Blocked Category User',
      department: 'Ops',
      badge_number: 'UT-BADGE-5',
      worker_category_id: blockedCategory._id
    });

    const result = await validateConsumptionEligibility(blockedEmployee, 'lunch', '2026-03-22', {
      canteenLocation: 'Main Canteen'
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
    expect(result.error).toBe('Vendor restriction does not allow this worker category for the selected meal type');
  });

  test('blocks near-simultaneous duplicate attempts via duplicate window', async () => {
    const employee = await Employee.create({
      employee_number: 'UT006',
      name: 'Window User',
      department: 'Ops',
      badge_number: 'UT-BADGE-6'
    });

    await MealRecord.create({
      employee_id: employee._id,
      meal_type: 'lunch',
      status: 'used',
      consumption_date: '2026-03-21',
      consumed_at: new Date()
    });

    const result = await validateConsumptionEligibility(employee, 'lunch', '2026-03-22');
    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
    expect(result.error).toBe('Duplicate redemption attempt blocked by duplicate window');
  });
});
