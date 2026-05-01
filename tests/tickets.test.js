process.env.NODE_ENV = 'test';

jest.mock('../src/database');

const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../src/app');
const {
  initializeDatabase,
  closeDatabase,
  Employee,
  MealPlan,
  MealRecord,
  AuditLog,
  QRTokenMetadata,
  EmployeeCategory,
  Vendor,
  VendorRestriction,
  Transaction,
  EmployeeEntitlementBalance,
  User
} = require('../src/database');

let agent;
let testEmployee;

beforeAll(async () => {
  await initializeDatabase();
  agent = request.agent(app);
});

beforeEach(async () => {
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
  await MealRecord.deleteMany({});
  await AuditLog.deleteMany({});
  await QRTokenMetadata.deleteMany({});
  await VendorRestriction.deleteMany({});
  await Vendor.deleteMany({});
  await Transaction.deleteMany({});
  await EmployeeEntitlementBalance.deleteMany({});
  await EmployeeCategory.deleteMany({});
  await Employee.deleteMany({});
  testEmployee = await Employee.create({
    employee_number: 'EMP001',
    name: 'Test Employee',
    department: 'Engineering',
    badge_number: 'BADGE001'
  });
});

afterAll(async () => {
  await closeDatabase();
});

describe('Tickets Routes', () => {
  test('POST /api/tickets/consume stops writing legacy staff_id when cutover flag is disabled', async () => {
    const previousValue = process.env.LEGACY_STAFF_ID_FALLBACK_ENABLED;

    try {
      process.env.LEGACY_STAFF_ID_FALLBACK_ENABLED = 'false';
      jest.resetModules();
      jest.doMock('../src/database');

      const freshRequest = require('supertest');
      const freshApp = require('../src/app');
      const freshDatabase = require('../src/database');
      const {
        initializeDatabase: initializeFreshDatabase,
        closeDatabase: closeFreshDatabase,
        Employee: FreshEmployee,
        MealRecord: FreshMealRecord
      } = freshDatabase;

      await initializeFreshDatabase();

      const freshAgent = freshRequest.agent(freshApp);
      await freshAgent.post('/api/auth/login').send({ username: 'admin', password: 'admin123' });

      const employee = await FreshEmployee.create({
        employee_number: 'EMP-CUTOVER-001',
        name: 'Cutover Employee',
        department: 'Ops',
        badge_number: 'CUTOVER-1'
      });

      const consumeRes = await freshAgent.post('/api/tickets/consume').send({
        badge_number: employee.badge_number,
        meal_type: 'lunch',
        canteen_location: 'Main Canteen'
      });

      expect(consumeRes.status).toBe(201);

      const storedRecord = await FreshMealRecord.findOne({ employee_id: employee._id, meal_type: 'lunch' });
      expect(String(storedRecord.vendor_user_id)).toBe(String(consumeRes.body.record.vendor_user_id));
      expect(storedRecord.staff_id).toBeNull();

      await closeFreshDatabase();
    } finally {
      if (previousValue === undefined) {
        delete process.env.LEGACY_STAFF_ID_FALLBACK_ENABLED;
      } else {
        process.env.LEGACY_STAFF_ID_FALLBACK_ENABLED = previousValue;
      }

      jest.resetModules();
      jest.doMock('../src/database');
    }
  });

  test('GET /api/tickets/validate/:badge returns 404 for unknown badge', async () => {
    const res = await agent.get('/api/tickets/validate/UNKNOWN_BADGE');
    expect(res.status).toBe(404);
  });

  test('GET /api/tickets/validate/:badge includes entitlement balance fields', async () => {
    const res = await agent.get('/api/tickets/validate/BADGE001?meal_type=lunch');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('allowed');
    expect(res.body).toHaveProperty('consumed');
    expect(res.body).toHaveProperty('remaining');
  });

  test('POST /api/tickets/consume records consumption for valid employee', async () => {
    const res = await agent.post('/api/tickets/consume').send({
      badge_number: 'BADGE001',
      meal_type: 'lunch',
      canteen_location: 'Main Canteen'
    });
    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Meal recorded successfully');
    expect(res.body.transaction).toBeDefined();
    expect(typeof res.body.transaction.transaction_reference).toBe('string');

    const auditEntries = await AuditLog.find({ action: 'ticket.consume' });
    const success = auditEntries.find((entry) => entry.outcome === 'success');
    expect(success).toBeDefined();

    const transactions = await Transaction.find({ employee_id: testEmployee._id });
    expect(transactions.length).toBe(1);
  });

  test('POST /api/tickets/consume prevents duplicate consumption', async () => {
    await agent.post('/api/tickets/consume').send({
      badge_number: 'BADGE001',
      meal_type: 'lunch'
    });
    const res = await agent.post('/api/tickets/consume').send({
      badge_number: 'BADGE001',
      meal_type: 'lunch'
    });
    expect(res.status).toBe(409);

    const auditEntries = await AuditLog.find({ action: 'ticket.consume' });
    const failure = auditEntries.find((entry) => entry.outcome === 'failure' && entry.reason === 'Meal already recorded for this employee today');
    expect(failure).toBeDefined();
  });

  test('POST /api/tickets/consume rolls back meal/entitlement when transaction write fails', async () => {
    const originalCreate = Transaction.create;
    Transaction.create = async () => {
      throw new Error('transaction write failed');
    };

    try {
      const res = await agent.post('/api/tickets/consume').send({
        badge_number: 'BADGE001',
        meal_type: 'lunch',
        canteen_location: 'Main Canteen'
      });

      expect(res.status).toBe(500);

      const records = await MealRecord.find({ employee_id: testEmployee._id, meal_type: 'lunch' });
      expect(records.length).toBe(0);

      const balance = await EmployeeEntitlementBalance.findOne({
        employee_id: testEmployee._id,
        meal_type: 'lunch',
        balance_date: new Date().toISOString().split('T')[0]
      });
      expect(balance).toBeTruthy();
      expect(balance.consumed).toBe(0);
    } finally {
      Transaction.create = originalCreate;
    }
  });

  test('POST /api/tickets/consume rejects meal type not allowed by meal plan', async () => {
    const breakfastOnlyPlan = await MealPlan.create({
      name: 'Breakfast Only',
      breakfast: true,
      lunch: false,
      dinner: false,
      active: true
    });

    await Employee.findByIdAndUpdate(testEmployee._id, {
      $set: { meal_plan_id: breakfastOnlyPlan._id }
    });

    const res = await agent.post('/api/tickets/consume').send({
      badge_number: 'BADGE001',
      meal_type: 'dinner'
    });

    expect(res.status).toBe(403);
  });

  test('POST /api/tickets/consume rejects suspended employee', async () => {
    await Employee.findByIdAndUpdate(testEmployee._id, {
      $set: { status: 'suspended', active: false }
    });

    const res = await agent.post('/api/tickets/consume').send({
      badge_number: 'BADGE001',
      meal_type: 'lunch'
    });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  test('POST /api/tickets/consume enforces vendor restriction checks', async () => {
    const allowedCategory = await EmployeeCategory.create({ code: 'TK-ALLOW', name: 'Allowed Category' });
    const blockedCategory = await EmployeeCategory.create({ code: 'TK-BLOCK', name: 'Blocked Category' });
    const vendor = await Vendor.create({ code: 'VEND-01', name: 'Main Vendor', canteen_location: 'Main Canteen', active: true });

    await VendorRestriction.create({
      vendor_id: vendor._id,
      worker_category_id: allowedCategory._id,
      meal_type: 'lunch',
      active: true
    });

    await Employee.findByIdAndUpdate(testEmployee._id, {
      $set: { worker_category_id: blockedCategory._id }
    });

    const res = await agent.post('/api/tickets/consume').send({
      badge_number: 'BADGE001',
      meal_type: 'lunch',
      canteen_location: 'Main Canteen'
    });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.error).toBe('Vendor restriction does not allow this employee category for the selected meal type');
  });

  test('POST /api/tickets/consume rejects client-supplied entitlement fields', async () => {
    const res = await agent.post('/api/tickets/consume').send({
      badge_number: 'BADGE001',
      meal_type: 'lunch',
      remaining: 999
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('POST /api/tickets/consume blocks near-simultaneous duplicate attempts by window', async () => {
    await MealRecord.create({
      employee_id: testEmployee._id,
      meal_type: 'lunch',
      status: 'used',
      consumption_date: '2026-03-21',
      consumed_at: new Date(),
      canteen_location: 'Main Canteen'
    });

    const res = await agent.post('/api/tickets/consume').send({
      badge_number: 'BADGE001',
      meal_type: 'lunch',
      canteen_location: 'Main Canteen'
    });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.error).toBe('Duplicate redemption attempt blocked by duplicate window');
  });

  test('GET /api/tickets/history returns records', async () => {
    await agent.post('/api/tickets/consume').send({
      badge_number: 'BADGE001',
      meal_type: 'breakfast'
    });
    const res = await agent.get('/api/tickets/history');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('GET /api/tickets/history supports pagination when page/limit are provided', async () => {
    await agent.post('/api/tickets/consume').send({
      badge_number: 'BADGE001',
      meal_type: 'breakfast'
    });

    const res = await agent.get('/api/tickets/history?page=1&limit=1');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(1);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(1);
  });

  test('POST /api/tickets/qr-token issues a signed QR token for an active employee', async () => {
    const res = await agent.post('/api/tickets/qr-token').send({
      badge_number: 'BADGE001',
      ttl_seconds: 600
    });

    expect(res.status).toBe(201);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.split('.').length).toBe(2);
    expect(res.body.employee.badge_number).toBe('BADGE001');
    expect(res.body.ttl_seconds).toBe(600);
  });

  test('POST /api/tickets/qr-token allows an employee to issue a signed QR token for their own profile', async () => {
    const password = await bcrypt.hash('employee-self-pass', 10);
    await User.create({
      username: 'employee.self',
      password,
      role: 'employee',
      employee_id: testEmployee._id
    });

    const employeeAgent = request.agent(app);
    await employeeAgent.post('/api/auth/login').send({ username: 'employee.self', password: 'employee-self-pass' });

    const res = await employeeAgent.post('/api/tickets/qr-token').send({
      employee_id: testEmployee.id,
      ttl_seconds: 600
    });

    expect(res.status).toBe(201);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.employee.badge_number).toBe('BADGE001');
  });

  test('POST /api/tickets/qr-token rejects an employee issuing a token for another worker', async () => {
    const otherEmployee = await Employee.create({
      employee_number: 'EMP002',
      name: 'Other Employee',
      department: 'Operations',
      badge_number: 'BADGE002'
    });
    const password = await bcrypt.hash('employee-other-pass', 10);
    await User.create({
      username: 'employee.other',
      password,
      role: 'employee',
      employee_id: testEmployee._id
    });

    const employeeAgent = request.agent(app);
    await employeeAgent.post('/api/auth/login').send({ username: 'employee.other', password: 'employee-other-pass' });

    const res = await employeeAgent.post('/api/tickets/qr-token').send({
      employee_id: otherEmployee.id,
      ttl_seconds: 600
    });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  test('POST /api/tickets/validate-token validates signed QR token server-side', async () => {
    const issued = await agent.post('/api/tickets/qr-token').send({
      badge_number: 'BADGE001'
    });

    const res = await agent.post('/api/tickets/validate-token').send({
      token: issued.body.token,
      meal_type: 'lunch'
    });

    expect(res.status).toBe(200);
    expect(res.body.employee.badge_number).toBe('BADGE001');
    expect(res.body).toHaveProperty('can_consume');
    expect(res.body).toHaveProperty('remaining');
  });

  test('POST /api/tickets/validate-token rejects invalid signed token', async () => {
    const res = await agent.post('/api/tickets/validate-token').send({
      token: 'invalid.token',
      meal_type: 'lunch'
    });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('INVALID_QR_TOKEN');
  });

  test('GET /api/tickets/self-service-summary returns worker-scoped portal data for an employee user', async () => {
    const password = await bcrypt.hash('employee-pass', 10);
    await User.create({
      username: 'employee.portal',
      password,
      role: 'employee',
      employee_id: testEmployee._id
    });

    await MealRecord.create({
      employee_id: testEmployee._id,
      meal_type: 'breakfast',
      status: 'used',
      consumption_date: '2026-03-23',
      consumed_at: new Date('2026-03-23T08:00:00.000Z'),
      canteen_location: 'Main Canteen'
    });

    const employeeAgent = request.agent(app);
    await employeeAgent.post('/api/auth/login').send({ username: 'employee.portal', password: 'employee-pass' });

    const res = await employeeAgent.get('/api/tickets/self-service-summary?date=2026-03-23');

    expect(res.status).toBe(200);
    expect(res.body.employee.name).toBe('Test Employee');
    expect(res.body.employee.employee_category_id).toBeNull();
    expect(res.body.employee.employee_category_name).toBeNull();
    expect(res.body.stats.consumed_today).toBe(1);
    expect(res.body.stats.next_eligible_meal).toBeTruthy();
    expect(res.body.meal_statuses).toHaveLength(3);
    expect(res.body.meal_statuses.find((entry) => entry.meal_type === 'breakfast').status).toBe('consumed');
    expect(res.body.recent_activity).toHaveLength(1);
    expect(res.body.recent_activity[0].meal_type).toBe('breakfast');
  });

  test('POST /api/tickets/consume can redeem from a signed QR token only once', async () => {
    const issued = await agent.post('/api/tickets/qr-token').send({
      badge_number: 'BADGE001'
    });

    const first = await agent.post('/api/tickets/consume').send({
      token: issued.body.token,
      meal_type: 'lunch',
      canteen_location: 'Main Canteen'
    });

    expect(first.status).toBe(201);
    expect(first.body.employee.badge_number).toBe('BADGE001');
    expect(first.body.transaction).toBeDefined();

    const second = await agent.post('/api/tickets/consume').send({
      token: issued.body.token,
      meal_type: 'lunch',
      canteen_location: 'Main Canteen'
    });

    expect(second.status).toBe(409);
    expect(second.body.code).toBe('CONSUMED_QR_TOKEN');
  });

  test('POST /api/tickets/validate-token rejects a token after successful redemption', async () => {
    const issued = await agent.post('/api/tickets/qr-token').send({
      badge_number: 'BADGE001'
    });

    await agent.post('/api/tickets/consume').send({
      token: issued.body.token,
      meal_type: 'lunch',
      canteen_location: 'Main Canteen'
    });

    const res = await agent.post('/api/tickets/validate-token').send({
      token: issued.body.token,
      meal_type: 'lunch'
    });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONSUMED_QR_TOKEN');
  });
});
