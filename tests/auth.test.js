process.env.NODE_ENV = 'test';

jest.mock('../src/database');

const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../src/app');
const { initializeDatabase, closeDatabase, User } = require('../src/database');

beforeAll(async () => {
  await initializeDatabase();
});

afterAll(async () => {
  await closeDatabase();
});

describe('Auth Routes', () => {
  test('GET /api/health includes explicit security headers', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['permissions-policy']).toBe('geolocation=(), microphone=(), camera=()');
  });

  test('GET /api/health allows configured local frontend origin via CORS', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'http://localhost:5173');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  test('GET /api/health does not reflect disallowed origin', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'https://malicious.example');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('OPTIONS preflight returns 204 with CORS method/header policy', async () => {
    const res = await request(app)
      .options('/api/health')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'GET');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-methods']).toContain('GET');
    expect(res.headers['access-control-allow-headers']).toContain('X-CSRF-Token');
  });

  test('GET /api/health returns generated X-Request-Id when not provided', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBeDefined();
    expect(typeof res.headers['x-request-id']).toBe('string');
    expect(res.headers['x-request-id'].length).toBeGreaterThan(0);
  });

  test('GET /api/health echoes provided X-Request-Id', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('X-Request-Id', 'req-test-123');

    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBe('req-test-123');
  });

  test('GET /api/health returns service health payload', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('dangote-cms-backend');
  });

  test('GET /api/readiness returns ready when database is connected', async () => {
    const res = await request(app).get('/api/readiness');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
    expect(res.body.checks).toBeDefined();
    expect(res.body.checks.database).toBe('up');
  });

  test('GET /api/dashboard/indicators returns operational and risk indicators', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'admin123' });

    const res = await agent.get('/api/dashboard/indicators');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('risk_indicators');
    expect(res.body).toHaveProperty('operational_indicators');
    expect(res.body.risk_indicators).toHaveProperty('failed_attempts_today');
    expect(res.body.operational_indicators).toHaveProperty('redemptions_today');
  });

  test('viewer role can access reporting endpoints', async () => {
    const password = await bcrypt.hash('viewer-pass', 10);
    await User.create({ username: 'viewer.user', password, role: 'viewer' });

    const viewerAgent = request.agent(app);
    await viewerAgent.post('/api/auth/login').send({ username: 'viewer.user', password: 'viewer-pass' });

    const res = await viewerAgent.get('/api/reports/daily');
    expect(res.status).toBe(200);
  });

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
