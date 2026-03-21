process.env.NODE_ENV = 'test';

jest.mock('../src/database');

const request = require('supertest');
const app = require('../src/app');
const { initializeDatabase, closeDatabase, Employee, MealRecord, AuditLog } = require('../src/database');

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
});