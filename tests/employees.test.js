process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../src/app');
const { initializeDatabase, closeDatabase, getDb } = require('../src/database');

let agent;

beforeAll(() => {
  initializeDatabase();
  agent = request.agent(app);
});

beforeEach(async () => {
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
  const db = getDb();
  db.prepare('DELETE FROM meal_records').run();
  db.prepare('DELETE FROM employees').run();
});

afterAll(() => {
  closeDatabase();
});

describe('Employees Routes', () => {
  test('GET /api/employees returns empty array initially', async () => {
    const res = await agent.get('/api/employees');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(0);
  });

  test('POST /api/employees creates an employee', async () => {
    const res = await agent.post('/api/employees').send({
      employee_number: 'EMP001',
      name: 'John Doe',
      department: 'Engineering',
      email: 'john@dangote.com',
      badge_number: 'BADGE001'
    });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('John Doe');
    expect(res.body.employee_number).toBe('EMP001');
  });

  test('GET /api/employees/:id returns the created employee', async () => {
    const createRes = await agent.post('/api/employees').send({
      employee_number: 'EMP002',
      name: 'Jane Smith',
      department: 'HR',
      badge_number: 'BADGE002'
    });
    const id = createRes.body.id;
    const res = await agent.get(`/api/employees/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Jane Smith');
  });

  test('PUT /api/employees/:id updates the employee', async () => {
    const createRes = await agent.post('/api/employees').send({
      employee_number: 'EMP003',
      name: 'Bob Jones',
      department: 'IT',
      badge_number: 'BADGE003'
    });
    const id = createRes.body.id;
    const res = await agent.put(`/api/employees/${id}`).send({ name: 'Robert Jones' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Robert Jones');
  });

  test('DELETE /api/employees/:id deletes the employee', async () => {
    const createRes = await agent.post('/api/employees').send({
      employee_number: 'EMP004',
      name: 'Alice Brown',
      department: 'Finance',
      badge_number: 'BADGE004'
    });
    const id = createRes.body.id;
    const res = await agent.delete(`/api/employees/${id}`);
    expect(res.status).toBe(200);
    const getRes = await agent.get(`/api/employees/${id}`);
    expect(getRes.status).toBe(404);
  });

  test('GET /api/employees without auth returns 401', async () => {
    const res = await request(app).get('/api/employees');
    expect(res.status).toBe(401);
  });
});
