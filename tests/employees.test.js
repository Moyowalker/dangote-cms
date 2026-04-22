process.env.NODE_ENV = 'test';

jest.mock('../src/database');

const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../src/app');
const { initializeDatabase, closeDatabase, Employee, MealRecord, User, WorkerCategory } = require('../src/database');

let agent;

beforeAll(async () => {
  await initializeDatabase();
  agent = request.agent(app);
});

beforeEach(async () => {
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
  await MealRecord.deleteMany({});
  await User.deleteMany({});
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
    expect(res.body.employee_category_id).toBeNull();
  });

  test('POST /api/employees accepts employee_category_id as the canonical category field', async () => {
    const category = await WorkerCategory.create({ code: 'EMP-CREATE', name: 'Create Category' });

    const res = await agent.post('/api/employees').send({
      employee_number: 'EMP001CAT',
      name: 'John Category',
      department: 'Engineering',
      badge_number: 'BADGE001CAT',
      employee_category_id: category.id
    });

    expect(res.status).toBe(201);
    expect(res.body.worker_category_id).toBe(category.id);
    expect(res.body.employee_category_id).toBe(category.id);
  });

  test('POST /api/employees accepts a worker photo data URL', async () => {
    const res = await agent.post('/api/employees').send({
      employee_number: 'EMP001PHOTO',
      name: 'John Photo',
      department: 'Engineering',
      badge_number: 'BADGE001PHOTO',
      photo_data_url: 'data:image/png;base64,ZmFrZV9pbWFnZQ=='
    });

    expect(res.status).toBe(201);
    expect(res.body.photo_data_url).toBe('data:image/png;base64,ZmFrZV9pbWFnZQ==');
  });

  test('PUT /api/employees rejects an invalid worker photo payload', async () => {
    const createRes = await agent.post('/api/employees').send({
      employee_number: 'EMP003PHOTO',
      name: 'Photo Reject',
      department: 'IT',
      badge_number: 'BADGE003PHOTO'
    });

    const res = await agent.put(`/api/employees/${createRes.body.id}`).send({
      photo_data_url: 'not-an-image'
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
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

  test('PUT /api/employees/:id accepts employee_category_id as the canonical category field', async () => {
    const category = await WorkerCategory.create({ code: 'EMP-UPDATE', name: 'Update Category' });

    const createRes = await agent.post('/api/employees').send({
      employee_number: 'EMP003CAT',
      name: 'Bob Category',
      department: 'IT',
      badge_number: 'BADGE003CAT'
    });

    const res = await agent.put(`/api/employees/${createRes.body.id}`).send({
      employee_category_id: category.id
    });

    expect(res.status).toBe(200);
    expect(res.body.worker_category_id).toBe(category.id);
    expect(res.body.employee_category_id).toBe(category.id);
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

  test('POST /api/employees/:id/portal-access provisions worker login details', async () => {
    const createRes = await agent.post('/api/employees').send({
      employee_number: 'EMP005',
      name: 'Portal Worker',
      department: 'Finance',
      badge_number: 'BADGE005'
    });

    const portalRes = await agent.post(`/api/employees/${createRes.body.id}/portal-access`).send({});

    expect(portalRes.status).toBe(201);
    expect(portalRes.body.enabled).toBe(true);
    expect(portalRes.body.username).toBe('EMP005');
    expect(typeof portalRes.body.temporary_password).toBe('string');
    expect(portalRes.body.temporary_password.length).toBeGreaterThan(5);

    const employeeAgent = request.agent(app);
    const loginRes = await employeeAgent.post('/api/auth/login').send({
      username: portalRes.body.username,
      password: portalRes.body.temporary_password
    });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user.role).toBe('employee');
    expect(loginRes.body.user.employee_id).toBe(createRes.body.id);
  });

  test('POST /api/employees/:id/portal-access resets an existing worker login with a custom username', async () => {
    const createRes = await agent.post('/api/employees').send({
      employee_number: 'EMP005RESET',
      name: 'Portal Reset Worker',
      department: 'Finance',
      badge_number: 'BADGE005RESET'
    });

    const firstPortalRes = await agent.post(`/api/employees/${createRes.body.id}/portal-access`).send({});
    expect(firstPortalRes.status).toBe(201);

    const secondPortalRes = await agent.post(`/api/employees/${createRes.body.id}/portal-access`).send({
      username: 'portal.reset.worker'
    });

    expect(secondPortalRes.status).toBe(201);
    expect(secondPortalRes.body.username).toBe('portal.reset.worker');
    expect(secondPortalRes.body.temporary_password).not.toBe(firstPortalRes.body.temporary_password);

    const employeeAgent = request.agent(app);
    const loginRes = await employeeAgent.post('/api/auth/login').send({
      username: secondPortalRes.body.username,
      password: secondPortalRes.body.temporary_password
    });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user.employee_id).toBe(createRes.body.id);
  });

  test('POST /api/employees/:id/portal-access rejects a username already used by another account', async () => {
    const firstEmployeeRes = await agent.post('/api/employees').send({
      employee_number: 'EMP005A',
      name: 'Portal Worker A',
      department: 'Finance',
      badge_number: 'BADGE005A'
    });
    const secondEmployeeRes = await agent.post('/api/employees').send({
      employee_number: 'EMP005B',
      name: 'Portal Worker B',
      department: 'Finance',
      badge_number: 'BADGE005B'
    });

    const firstPortalRes = await agent.post(`/api/employees/${firstEmployeeRes.body.id}/portal-access`).send({
      username: 'shared.portal.user'
    });
    expect(firstPortalRes.status).toBe(201);

    const conflictRes = await agent.post(`/api/employees/${secondEmployeeRes.body.id}/portal-access`).send({
      username: 'shared.portal.user'
    });

    expect(conflictRes.status).toBe(409);
    expect(conflictRes.body.code).toBe('CONFLICT');
    expect(conflictRes.body.error).toBe('That username is already in use');
  });

  test('DELETE /api/employees/:id/portal-access revokes worker login access', async () => {
    const createRes = await agent.post('/api/employees').send({
      employee_number: 'EMP006',
      name: 'Revoked Worker',
      department: 'Ops',
      badge_number: 'BADGE006'
    });

    const portalRes = await agent.post(`/api/employees/${createRes.body.id}/portal-access`).send({});
    expect(portalRes.status).toBe(201);

    const revokeRes = await agent.delete(`/api/employees/${createRes.body.id}/portal-access`);
    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.enabled).toBe(false);

    const employeeAgent = request.agent(app);
    const loginRes = await employeeAgent.post('/api/auth/login').send({
      username: portalRes.body.username,
      password: portalRes.body.temporary_password
    });

    expect(loginRes.status).toBe(401);
  });
});
