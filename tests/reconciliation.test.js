process.env.NODE_ENV = 'test';

jest.mock('../src/database');

const request = require('supertest');
const app = require('../src/app');
const { initializeDatabase, closeDatabase, Employee, MealRecord, AuditLog, WorkerCategory } = require('../src/database');

let agent;

beforeAll(async () => {
  await initializeDatabase();
  agent = request.agent(app);
});

beforeEach(async () => {
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
  await AuditLog.deleteMany({});
  await MealRecord.deleteMany({});
  await Employee.deleteMany({});
  await WorkerCategory.deleteMany({});
});

afterAll(async () => {
  await closeDatabase();
});

describe('Reconciliation and Reporting Aggregation', () => {
  test('GET /api/reconciliation/vendor-daily aggregates by vendor/date with discrepancy indicator', async () => {
    await Employee.create({
      employee_number: 'REC001',
      name: 'Recon User',
      department: 'Ops',
      badge_number: 'RECON-1'
    });

    await agent.post('/api/tickets/consume').send({ badge_number: 'RECON-1', meal_type: 'lunch' });
    await agent.post('/api/tickets/consume').send({ badge_number: 'RECON-1', meal_type: 'lunch' });

    const today = new Date().toISOString().split('T')[0];
    const res = await agent.get(`/api/reconciliation/vendor-daily?date=${today}`);

    expect(res.status).toBe(200);
    expect(res.body.date).toBe(today);
    expect(Array.isArray(res.body.summary)).toBe(true);
    expect(res.body.summary.length).toBeGreaterThan(0);
    expect(res.body.summary[0]).toHaveProperty('vendor_user_id');
    expect(res.body.summary[0]).toHaveProperty('total_consumptions');
    expect(res.body.summary[0]).toHaveProperty('failed_attempts');
    expect(res.body.summary[0]).toHaveProperty('discrepancy_indicator');
  });

  test('GET /api/reconciliation/vendor-daily rejects invalid date format', async () => {
    const res = await agent.get('/api/reconciliation/vendor-daily?date=21-03-2026');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('GET /api/reconciliation/vendor-daily supports pagination when page/limit are provided', async () => {
    await Employee.create({
      employee_number: 'REC002',
      name: 'Recon User 2',
      department: 'Ops',
      badge_number: 'RECON-2'
    });

    await agent.post('/api/tickets/consume').send({ badge_number: 'RECON-2', meal_type: 'lunch' });
    await agent.post('/api/tickets/consume').send({ badge_number: 'RECON-2', meal_type: 'lunch' });
    const today = new Date().toISOString().split('T')[0];

    const res = await agent.get(`/api/reconciliation/vendor-daily?date=${today}&page=1&limit=1`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.summary)).toBe(true);
    expect(res.body.summary.length).toBe(1);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(1);
  });

  test('GET /api/reports/daily returns aggregation summary and details', async () => {
    await Employee.create({
      employee_number: 'REP001',
      name: 'Report User',
      department: 'Engineering',
      badge_number: 'REPORT-1'
    });

    await agent.post('/api/tickets/consume').send({ badge_number: 'REPORT-1', meal_type: 'breakfast' });
    const today = new Date().toISOString().split('T')[0];

    const res = await agent.get(`/api/reports/daily?date=${today}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.summary)).toBe(true);
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(res.body.total).toBeGreaterThan(0);
  });

  test('GET /api/reports/daily supports pagination when page/limit are provided', async () => {
    await Employee.create({
      employee_number: 'REP002',
      name: 'Report User 2',
      department: 'Engineering',
      badge_number: 'REPORT-2'
    });

    await agent.post('/api/tickets/consume').send({ badge_number: 'REPORT-2', meal_type: 'breakfast' });
    const today = new Date().toISOString().split('T')[0];

    const res = await agent.get(`/api/reports/daily?date=${today}&page=1&limit=1`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(res.body.details.length).toBe(1);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(1);
  });

  test('GET /api/reports/daily supports date range, vendor, status, and worker category filters', async () => {
    const categoryA = await WorkerCategory.create({ code: 'CAT-A', name: 'Category A' });
    const categoryB = await WorkerCategory.create({ code: 'CAT-B', name: 'Category B' });

    const empA = await Employee.create({
      employee_number: 'REP100',
      name: 'Filter User A',
      department: 'Ops',
      badge_number: 'FILTER-1',
      worker_category_id: categoryA._id
    });

    const empB = await Employee.create({
      employee_number: 'REP101',
      name: 'Filter User B',
      department: 'Ops',
      badge_number: 'FILTER-2',
      worker_category_id: categoryB._id
    });

    await MealRecord.create({
      employee_id: empA._id,
      meal_type: 'lunch',
      status: 'used',
      consumption_date: '2026-03-20',
      canteen_location: 'Main Canteen'
    });

    await MealRecord.create({
      employee_id: empB._id,
      meal_type: 'lunch',
      status: 'used',
      consumption_date: '2026-03-20',
      canteen_location: 'Annex Canteen'
    });

    const res = await agent.get(
      `/api/reports/daily?start_date=2026-03-19&end_date=2026-03-21&vendor=Main%20Canteen&status=used&worker_category_id=${categoryA._id}`
    );

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(res.body.total).toBe(1);
    expect(res.body.details[0].employee_id).toBe(String(empA._id));
    expect(res.body.details[0].canteen_location).toBe('Main Canteen');
    expect(res.body.details[0].status).toBe('used');
  });

  test('GET /api/reports/daily rejects invalid status filter', async () => {
    const res = await agent.get('/api/reports/daily?status=invalid-status');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});