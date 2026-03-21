const request = require('supertest');
process.env.NODE_ENV = 'test';
const app = require('../src/server');
const db = require('../src/config/database');

let adminToken;

beforeAll(async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'Admin@123' });
  adminToken = res.body.token;
});

afterAll(() => {
  // Clean up test workers created during tests
  db.prepare("DELETE FROM workers WHERE employee_id LIKE 'TEST%'").run();
});

describe('Workers Routes', () => {
  it('GET /api/workers without auth returns 401', async () => {
    const res = await request(app).get('/api/workers');
    expect(res.status).toBe(401);
  });

  it('GET /api/workers with admin token returns 200 + array', async () => {
    const res = await request(app)
      .get('/api/workers')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/workers creates new worker', async () => {
    const res = await request(app)
      .post('/api/workers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        employee_id: 'TEST001',
        name: 'Test Worker',
        department: 'Testing',
        meal_plan: 'lunch'
      });
    expect(res.status).toBe(201);
    expect(res.body.employee_id).toBe('TEST001');
    expect(res.body.name).toBe('Test Worker');
  });

  it('POST /api/workers with duplicate employee_id returns 409', async () => {
    const res = await request(app)
      .post('/api/workers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        employee_id: 'TEST001',
        name: 'Another Worker',
        department: 'Testing',
        meal_plan: 'lunch'
      });
    expect(res.status).toBe(409);
  });

  it('PUT /api/workers/:id updates worker', async () => {
    // First get a worker
    const listRes = await request(app)
      .get('/api/workers')
      .set('Authorization', `Bearer ${adminToken}`);
    const worker = listRes.body[0];

    const res = await request(app)
      .put(`/api/workers/${worker.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Updated Name' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Name');

    // Restore original name
    await request(app)
      .put(`/api/workers/${worker.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: worker.name });
  });

  it('GET /api/workers/:id returns single worker', async () => {
    const listRes = await request(app)
      .get('/api/workers')
      .set('Authorization', `Bearer ${adminToken}`);
    const worker = listRes.body[0];

    const res = await request(app)
      .get(`/api/workers/${worker.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(worker.id);
  });

  it('DELETE /api/workers/:id soft deletes worker', async () => {
    const listRes = await request(app)
      .get('/api/workers')
      .set('Authorization', `Bearer ${adminToken}`);
    const testWorker = listRes.body.find(w => w.employee_id === 'TEST001');

    const res = await request(app)
      .delete(`/api/workers/${testWorker.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});
