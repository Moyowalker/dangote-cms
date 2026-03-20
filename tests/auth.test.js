process.env.NODE_ENV = 'test';

jest.mock('../src/database');

const request = require('supertest');
const app = require('../src/app');
const { initializeDatabase, closeDatabase } = require('../src/database');

beforeAll(async () => {
  await initializeDatabase();
});

afterAll(async () => {
  await closeDatabase();
});

describe('Auth Routes', () => {
  test('POST /api/auth/login with valid credentials returns 200', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.username).toBe('admin');
    expect(res.body.user.role).toBe('admin');
  });

  test('POST /api/auth/login with invalid credentials returns 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  test('GET /api/auth/me without session returns 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('POST /api/auth/logout returns 200', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    const res = await agent.post('/api/auth/logout');
    expect(res.status).toBe(200);
  });

  test('GET /api/auth/me after login returns user', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.username).toBe('admin');
  });
});
