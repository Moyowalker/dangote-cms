process.env.NODE_ENV = 'test';

jest.mock('../src/database');

const request = require('supertest');
const app = require('../src/app');
const {
  initializeDatabase,
  closeDatabase,
  Employee,
  WorkerCategory,
  EntitlementPolicy
} = require('../src/database');

let agent;
let employee;

beforeAll(async () => {
  await initializeDatabase();
  agent = request.agent(app);
});

beforeEach(async () => {
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
  await EntitlementPolicy.deleteMany({});
  await WorkerCategory.deleteMany({});
  await Employee.deleteMany({});

  employee = await Employee.create({
    employee_number: 'EMP100',
    name: 'Entitlement User',
    department: 'Ops',
    badge_number: 'ENT100'
  });
});

afterAll(async () => {
  await closeDatabase();
});

describe('Entitlement Admin Routes', () => {
  test('POST /api/worker-categories creates category', async () => {
    const res = await agent.post('/api/worker-categories').send({
      code: 'COT',
      name: 'Contractor',
      description: 'Contract workers'
    });

    expect(res.status).toBe(201);
    expect(res.body.code).toBe('COT');
    expect(res.body.name).toBe('Contractor');
  });

  test('GET /api/employee-categories lists categories through the canonical alias route', async () => {
    await WorkerCategory.create({ code: 'EMP-LIST', name: 'Employee List Category' });

    const res = await agent.get('/api/employee-categories');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].code).toBe('EMP-LIST');
    expect(res.body[0].employee_category_name).toBe('Employee List Category');
  });

  test('POST /api/employee-categories creates category through the canonical alias route', async () => {
    const res = await agent.post('/api/employee-categories').send({
      code: 'ECAT',
      name: 'Employee Category Alias'
    });

    expect(res.status).toBe(201);
    expect(res.body.code).toBe('ECAT');
    expect(res.body.employee_category_name).toBe('Employee Category Alias');
  });

  test('POST /api/worker-categories rejects duplicate code', async () => {
    await agent.post('/api/worker-categories').send({ code: 'STAFF', name: 'Staff' });
    const res = await agent.post('/api/worker-categories').send({ code: 'STAFF', name: 'Staff B' });

    expect(res.status).toBe(409);
  });

  test('PUT /api/employee-categories/:id updates category through the canonical alias route', async () => {
    const category = await WorkerCategory.create({ code: 'EUP', name: 'Employee Update' });

    const res = await agent.put(`/api/employee-categories/${category.id}`).send({ name: 'Employee Update Renamed' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Employee Update Renamed');
    expect(res.body.employee_category_name).toBe('Employee Update Renamed');
  });

  test('DELETE /api/employee-categories/:id deletes category through the canonical alias route', async () => {
    const category = await WorkerCategory.create({ code: 'EDEL', name: 'Employee Delete' });

    const res = await agent.delete(`/api/employee-categories/${category.id}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Employee category deleted successfully');
  });

  test('POST /api/entitlement-policies creates policy for category', async () => {
    const category = await WorkerCategory.create({ code: 'PERM', name: 'Permanent' });

    const res = await agent.post('/api/entitlement-policies').send({
      worker_category_id: category.id,
      meal_type: 'lunch',
      daily_limit: 2
    });

    expect(res.status).toBe(201);
    expect(res.body.meal_type).toBe('lunch');
    expect(res.body.daily_limit).toBe(2);
    expect(res.body.employee_category_id).toBe(category.id);
  });

  test('POST /api/entitlement-policies accepts employee_category_id as the canonical category field', async () => {
    const category = await WorkerCategory.create({ code: 'EMP-CAT', name: 'Employee Category' });

    const res = await agent.post('/api/entitlement-policies').send({
      employee_category_id: category.id,
      meal_type: 'breakfast',
      daily_limit: 1
    });

    expect(res.status).toBe(201);
    expect(res.body.employee_category_id).toBe(category.id);
    expect(res.body.worker_category_id).toBe(category.id);
  });

  test('POST /api/entitlement-policies rejects negative daily_limit with consistent error envelope', async () => {
    const category = await WorkerCategory.create({ code: 'NEG', name: 'Negative Test' });

    const res = await agent.post('/api/entitlement-policies').send({
      worker_category_id: category.id,
      meal_type: 'lunch',
      daily_limit: -1
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(typeof res.body.error).toBe('string');
  });

  test('POST /api/entitlement-policies rejects missing category', async () => {
    const res = await agent.post('/api/entitlement-policies').send({
      worker_category_id: '000000000000000000000999',
      meal_type: 'breakfast',
      daily_limit: 1
    });

    expect(res.status).toBe(404);
  });

  test('PUT /api/employees/:id/category assigns worker category', async () => {
    const category = await WorkerCategory.create({ code: 'TEMP', name: 'Temp' });

    const res = await agent.put(`/api/employees/${employee.id}/category`).send({
      worker_category_id: category.id
    });

    expect(res.status).toBe(200);
    expect(res.body.worker_category_id).toBe(category.id);
    expect(res.body.employee_category_id).toBe(category.id);
  });

  test('PUT /api/employees/:id/category accepts employee_category_id as the canonical field', async () => {
    const category = await WorkerCategory.create({ code: 'TEMP2', name: 'Temp Two' });

    const res = await agent.put(`/api/employees/${employee.id}/category`).send({
      employee_category_id: category.id
    });

    expect(res.status).toBe(200);
    expect(res.body.worker_category_id).toBe(category.id);
    expect(res.body.employee_category_id).toBe(category.id);
  });

  test('GET /api/entitlement-policies lists existing policies', async () => {
    const category = await WorkerCategory.create({ code: 'LINE', name: 'Line Worker' });
    await EntitlementPolicy.create({
      worker_category_id: category.id,
      meal_type: 'dinner',
      daily_limit: 1,
      active: true
    });

    const res = await agent.get('/api/entitlement-policies');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
    expect(res.body[0].meal_type).toBe('dinner');
    expect(res.body[0].employee_category_id).toBe(category.id);
  });

  test('GET /api/entitlement-policies accepts employee_category_id as the canonical filter', async () => {
    const category = await WorkerCategory.create({ code: 'LINE2', name: 'Line Employee' });
    await EntitlementPolicy.create({
      worker_category_id: category.id,
      meal_type: 'dinner',
      daily_limit: 1,
      active: true
    });

    const res = await agent.get(`/api/entitlement-policies?employee_category_id=${category.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].employee_category_id).toBe(category.id);
  });
});