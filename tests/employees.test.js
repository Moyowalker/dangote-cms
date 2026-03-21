process.env.NODE_ENV = 'test';

jest.mock('../src/database');

const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../src/app');
const { initializeDatabase, closeDatabase, Employee, MealRecord, User } = require('../src/database');

let agent;

beforeAll(async () => {
  await initializeDatabase();
  agent = request.agent(app);
});

beforeEach(async () => {
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
  await MealRecord.deleteMany({});
  await Employee.deleteMany({});
});

afterAll(async () => {
  await closeDatabase();
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

  test('POST /api/employees rejects invalid email with consistent error envelope', async () => {
    const res = await agent.post('/api/employees').send({
      employee_number: 'EMP001X',
      name: 'John Doe',
      department: 'Engineering',
      email: 'invalid-email',
      badge_number: 'BADGE001X'
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(typeof res.body.error).toBe('string');
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

  test('GET /api/employees for employee role only returns own record', async () => {
    const ownEmployee = await Employee.create({
      employee_number: 'EMPOWN1',
      name: 'Own Employee',
      department: 'Ops',
      badge_number: 'OWN001'
    });

    await Employee.create({
      employee_number: 'EMPOTH1',
      name: 'Other Employee',
      department: 'Ops',
      badge_number: 'OTH001'
    });

    const password = await bcrypt.hash('emp123', 10);
    await User.create({
      username: 'employee_user_1',
      password,
      role: 'employee',
      employee_id: ownEmployee.id
    });

    const employeeAgent = request.agent(app);
    await employeeAgent.post('/api/auth/login').send({ username: 'employee_user_1', password: 'emp123' });

    const res = await employeeAgent.get('/api/employees');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
    expect(res.body[0].id).toBe(ownEmployee.id);
  });

  test('GET /api/employees supports pagination when page/limit are provided', async () => {
    await agent.post('/api/employees').send({
      employee_number: 'EMPPAGE1',
      name: 'Page One',
      department: 'Ops',
      badge_number: 'PAGE001'
    });
    await agent.post('/api/employees').send({
      employee_number: 'EMPPAGE2',
      name: 'Page Two',
      department: 'Ops',
      badge_number: 'PAGE002'
    });

    const res = await agent.get('/api/employees?page=1&limit=1');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(1);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(1);
    expect(res.body.pagination.total).toBe(2);
  });
});
