process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../src/app');
const { initializeDatabase, closeDatabase, getDb } = require('../src/database');

let agent;
let testEmployee;

beforeAll(() => {
  initializeDatabase();
  agent = request.agent(app);
});

beforeEach(async () => {
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
  const db = getDb();
  db.prepare('DELETE FROM meal_records').run();
  db.prepare('DELETE FROM employees').run();
  const result = db.prepare(
    'INSERT INTO employees (employee_number, name, department, badge_number) VALUES (?, ?, ?, ?)'
  ).run('EMP001', 'Test Employee', 'Engineering', 'BADGE001');
  testEmployee = db.prepare('SELECT * FROM employees WHERE id = ?').get(result.lastInsertRowid);
});

afterAll(() => {
  closeDatabase();
});

describe('Tickets Routes', () => {
  test('GET /api/tickets/validate/:badge returns 404 for unknown badge', async () => {
    const res = await agent.get('/api/tickets/validate/UNKNOWN_BADGE');
    expect(res.status).toBe(404);
  });

  test('POST /api/tickets/consume records consumption for valid employee', async () => {
    const res = await agent.post('/api/tickets/consume').send({
      badge_number: 'BADGE001',
      meal_type: 'lunch',
      canteen_location: 'Main Canteen'
    });
    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Meal recorded successfully');
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
});
