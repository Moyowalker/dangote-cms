process.env.NODE_ENV = 'test';

jest.mock('../src/database');

const request = require('supertest');
const app = require('../src/app');
const { initializeDatabase, closeDatabase, Employee } = require('../src/database');

let agent;

beforeAll(async () => {
  await initializeDatabase();
  agent = request.agent(app);
});

beforeEach(async () => {
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
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
});
