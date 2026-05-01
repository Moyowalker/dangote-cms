process.env.NODE_ENV = 'test';

jest.mock('../src/database');

const request = require('supertest');
const app = require('../src/app');
const { initializeDatabase, closeDatabase, Employee, WorkerCategory, MealRecord, AuditLog } = require('../src/database');

let agent;

beforeAll(async () => {
  await initializeDatabase();
  agent = request.agent(app);
});

beforeEach(async () => {
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
  await AuditLog.deleteMany({});
  await Employee.deleteMany({});
});

afterAll(async () => {
  await closeDatabase();
});

describe('Reports Routes', () => {
  test('GET /api/reports/worker-readiness summarizes active workers missing phone numbers or photos', async () => {
    await Employee.create({
      employee_number: 'EMP-READY-1',
      name: 'Ready Worker',
      department: 'Ops',
      badge_number: 'BG-READY-1',
      phone: '+2348012345678',
      photo_data_url: 'data:image/png;base64,ZmFrZQ=='
    });

    await Employee.create({
      employee_number: 'EMP-READY-2',
      name: 'Missing Phone',
      department: 'Ops',
      badge_number: 'BG-READY-2',
      photo_data_url: 'data:image/png;base64,ZmFrZQ=='
    });

    await Employee.create({
      employee_number: 'EMP-READY-3',
      name: 'Missing Photo',
      department: 'Finance',
      badge_number: 'BG-READY-3',
      phone: '+2348099991234'
    });

    await Employee.create({
      employee_number: 'EMP-READY-4',
      name: 'Missing Both',
      department: 'HR',
      badge_number: 'BG-READY-4'
    });

    await Employee.create({
      employee_number: 'EMP-READY-5',
      name: 'Inactive Missing',
      department: 'HR',
      badge_number: 'BG-READY-5',
      active: false,
      status: 'deactivated'
    });

    const res = await agent.get('/api/reports/worker-readiness');

    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({
      active_workers: 4,
      missing_phone: 2,
      missing_photo: 2,
      missing_both: 1,
      ready_workers: 1
    });
    expect(res.body.total).toBe(3);
    expect(res.body.workers.map((worker) => worker.employee_number)).toEqual([
      'EMP-READY-2',
      'EMP-READY-3',
      'EMP-READY-4'
    ]);
    const missingBothWorker = res.body.workers.find((worker) => worker.employee_number === 'EMP-READY-4');
    expect(missingBothWorker?.missing_phone).toBe(true);
    expect(missingBothWorker?.missing_photo).toBe(true);
  });

  test('GET /api/reports/employee-readiness exposes canonical employee-oriented payload keys', async () => {
    await Employee.create({
      employee_number: 'EMP-READY-10',
      name: 'Canonical Missing Phone',
      department: 'Ops',
      badge_number: 'BG-READY-10',
      photo_data_url: 'data:image/png;base64,ZmFrZQ=='
    });

    await Employee.create({
      employee_number: 'EMP-READY-11',
      name: 'Canonical Ready Employee',
      department: 'Finance',
      badge_number: 'BG-READY-11',
      phone: '+2348012349999',
      photo_data_url: 'data:image/png;base64,ZmFrZQ=='
    });

    const res = await agent.get('/api/reports/employee-readiness');

    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({
      active_employees: 2,
      missing_phone: 1,
      missing_photo: 0,
      missing_both: 0,
      ready_employees: 1
    });
    expect(Array.isArray(res.body.employees)).toBe(true);
    expect(res.body.employees).toHaveLength(1);
    expect(res.body.employees[0].employee_number).toBe('EMP-READY-10');
    expect(res.body.workers).toBeUndefined();
  });

  test('GET /api/reports/daily accepts employee_category_id as the canonical category filter', async () => {
    const categoryA = await WorkerCategory.create({ code: 'CAT-EMP-A', name: 'Employee Category A' });
    const categoryB = await WorkerCategory.create({ code: 'CAT-EMP-B', name: 'Employee Category B' });

    const employeeA = await Employee.create({
      employee_number: 'EMP-REP-1',
      name: 'Report Employee A',
      department: 'Ops',
      badge_number: 'EMP-REP-1',
      worker_category_id: categoryA._id
    });

    const employeeB = await Employee.create({
      employee_number: 'EMP-REP-2',
      name: 'Report Employee B',
      department: 'Ops',
      badge_number: 'EMP-REP-2',
      worker_category_id: categoryB._id
    });

    await MealRecord.create({
      employee_id: employeeA._id,
      meal_type: 'lunch',
      status: 'used',
      consumption_date: '2026-03-20',
      canteen_location: 'Main Canteen'
    });

    await MealRecord.create({
      employee_id: employeeB._id,
      meal_type: 'lunch',
      status: 'used',
      consumption_date: '2026-03-20',
      canteen_location: 'Main Canteen'
    });

    const res = await agent.get(
      `/api/reports/daily?start_date=2026-03-19&end_date=2026-03-21&vendor=Main%20Canteen&status=used&employee_category_id=${categoryA._id}`
    );

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.details[0].employee_id).toBe(String(employeeA._id));
  });

  test('GET /api/reports/audit returns filtered immutable audit entries with summary counts', async () => {
    await AuditLog.create({
      actor_user_id: '000000000000000000000001',
      actor_role: 'admin',
      action: 'employee.create',
      entity_type: 'employee',
      entity_id: 'employee-1',
      outcome: 'success',
      reason: null,
      metadata: { request_id: 'req-audit-1' },
      prev_hash: null,
      hash: 'hash-audit-1'
    });

    await AuditLog.create({
      actor_user_id: null,
      actor_role: null,
      action: 'auth.login',
      entity_type: 'session',
      entity_id: null,
      outcome: 'failure',
      reason: 'Invalid credentials',
      metadata: { request_id: 'req-audit-2' },
      prev_hash: 'hash-audit-1',
      hash: 'hash-audit-2'
    });

    const res = await agent.get('/api/reports/audit?action=employee.create&outcome=success');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.summary).toEqual({ total: 1, successes: 1, failures: 0 });
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].action).toBe('employee.create');
    expect(res.body.entries[0].metadata.request_id).toBe('req-audit-1');
  });

  test('GET /api/reports/audit/:id returns the selected audit entry detail', async () => {
    const created = await AuditLog.create({
      actor_user_id: '000000000000000000000001',
      actor_role: 'admin',
      action: 'employee.create',
      entity_type: 'employee',
      entity_id: 'employee-22',
      outcome: 'success',
      reason: null,
      metadata: {
        request_id: 'req-audit-detail-1',
        request_body: {
          employee_number: 'EMP022',
          badge_number: 'BADGE022'
        }
      },
      prev_hash: null,
      hash: 'hash-audit-detail-1'
    });

    const res = await agent.get(`/api/reports/audit/${created.id}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.id);
    expect(res.body.action).toBe('employee.create');
    expect(res.body.metadata.request_id).toBe('req-audit-detail-1');
    expect(res.body.metadata.request_body.employee_number).toBe('EMP022');
  });
});
