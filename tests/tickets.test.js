process.env.NODE_ENV = 'test';

jest.mock('../src/database');

const request = require('supertest');
const app = require('../src/app');
const { initializeDatabase, closeDatabase, Employee, MealPlan, MealRecord, AuditLog } = require('../src/database');

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

    const auditEntries = await AuditLog.find({ action: 'ticket.consume' });
    const success = auditEntries.find((entry) => entry.outcome === 'success');
    expect(success).toBeDefined();
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
});
