process.env.NODE_ENV = 'test';

jest.mock('../src/database');

const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../src/app');
const { initializeDatabase, closeDatabase, User, Employee, AuditLog } = require('../src/database');
const { resetRequestMetrics } = require('../src/services/requestMetricsService');

beforeAll(async () => {
  await initializeDatabase();
});

beforeEach(() => {
  resetRequestMetrics();
  return AuditLog.deleteMany({});
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

  test('legacy static UI can be disabled explicitly', async () => {
    const previousValue = process.env.LEGACY_STATIC_UI_ENABLED;

    try {
      process.env.LEGACY_STATIC_UI_ENABLED = 'false';
      jest.resetModules();
      jest.doMock('../src/database');

      const freshApp = require('../src/app');
      const res = await request(freshApp).get('/dashboard.html');

      expect(freshApp.locals.legacyStaticUiEnabled).toBe(false);
      expect(res.status).toBe(404);
    } finally {
      if (previousValue === undefined) {
        delete process.env.LEGACY_STATIC_UI_ENABLED;
      } else {
        process.env.LEGACY_STATIC_UI_ENABLED = previousValue;
      }

      jest.resetModules();
      jest.doMock('../src/database');
    }
  });

  test('GET /api/dashboard/indicators returns operational and risk indicators', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'admin123' });

    const res = await agent.get('/api/dashboard/indicators');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('risk_indicators');
    expect(res.body).toHaveProperty('operational_indicators');
    expect(res.body.risk_indicators).toHaveProperty('failed_attempts_today');
    expect(res.body.risk_indicators).toHaveProperty('failed_attempts_by_reason');
    expect(res.body.operational_indicators).toHaveProperty('redemptions_today');
    expect(res.body.operational_indicators).toHaveProperty('failed_attempts_by_location');
    expect(res.body.operational_indicators).toHaveProperty('ticket_endpoint_health');
    expect(res.body.operational_indicators.ticket_endpoint_health['ticket.validate']).toBeDefined();
    expect(res.body.operational_indicators.ticket_endpoint_health['ticket.consume']).toBeDefined();
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

    const auditEntries = await AuditLog.find({ action: 'auth.login' });
    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0].outcome).toBe('success');
    expect(auditEntries[0].metadata.request_body.username).toBe('admin');
    expect(auditEntries[0].metadata.request_body.password).toBe('[REDACTED]');
  });

  test('POST /api/auth/login with invalid credentials returns 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'wrongpassword' });
    expect(res.status).toBe(401);

    const auditEntries = await AuditLog.find({ action: 'auth.login' });
    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0].outcome).toBe('failure');
    expect(auditEntries[0].reason).toBe('Invalid credentials');
    expect(auditEntries[0].metadata.request_body.password).toBe('[REDACTED]');
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

  test('POST /api/auth/change-password updates the password for the logged-in user', async () => {
    const password = await bcrypt.hash('change-pass-123', 10);
    await User.create({ username: 'password.change.user', password, role: 'employee' });

    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'password.change.user', password: 'change-pass-123' });

    const changeRes = await agent.post('/api/auth/change-password').send({
      current_password: 'change-pass-123',
      new_password: 'change-pass-456'
    });

    expect(changeRes.status).toBe(200);
    expect(changeRes.body.message).toBe('Password changed successfully');

    const reloginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'password.change.user', password: 'change-pass-456' });

    expect(reloginRes.status).toBe(200);
  });

  test('POST /api/auth/change-password rejects the wrong current password', async () => {
    const password = await bcrypt.hash('wrong-current-123', 10);
    await User.create({ username: 'password.reject.user', password, role: 'employee' });

    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'password.reject.user', password: 'wrong-current-123' });

    const changeRes = await agent.post('/api/auth/change-password').send({
      current_password: 'wrong-password',
      new_password: 'wrong-current-456'
    });

    expect(changeRes.status).toBe(401);
    expect(changeRes.body.code).toBe('INVALID_CREDENTIALS');
  });

  test('POST /api/auth/password-recovery/verify and /reset let a worker recover access', async () => {
    const employee = await Employee.create({
      employee_number: 'EMP-REC-001',
      name: 'Recovery Worker',
      department: 'Operations',
      badge_number: 'BG-REC-001',
      phone: '+2348012345678'
    });
    const password = await bcrypt.hash('old-pass-123', 10);
    await User.create({
      username: 'recovery.worker',
      password,
      role: 'employee',
      employee_id: employee.id
    });

    const verifyRes = await request(app)
      .post('/api/auth/password-recovery/verify')
      .send({
        username: 'recovery.worker',
        employee_number: 'EMP-REC-001',
        badge_number: 'BG-REC-001',
        phone_last4: '5678'
      });

    expect(verifyRes.status).toBe(200);
    expect(typeof verifyRes.body.recovery_token).toBe('string');

    const resetRes = await request(app)
      .post('/api/auth/password-recovery/reset')
      .send({
        recovery_token: verifyRes.body.recovery_token,
        new_password: 'new-pass-123'
      });

    expect(resetRes.status).toBe(200);
    expect(resetRes.body.message).toMatch(/password reset successfully/i);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'recovery.worker', password: 'new-pass-123' });

    expect(loginRes.status).toBe(200);
  });

  test('POST /api/auth/password-recovery/verify rejects incorrect worker recovery details', async () => {
    const employee = await Employee.create({
      employee_number: 'EMP-REC-002',
      name: 'Recovery Reject Worker',
      department: 'Operations',
      badge_number: 'BG-REC-002',
      phone: '+2348012349999'
    });
    const password = await bcrypt.hash('old-pass-456', 10);
    await User.create({
      username: 'recovery.reject.worker',
      password,
      role: 'employee',
      employee_id: employee.id
    });

    const verifyRes = await request(app)
      .post('/api/auth/password-recovery/verify')
      .send({
        username: 'recovery.reject.worker',
        employee_number: 'EMP-REC-002',
        badge_number: 'BG-REC-002',
        phone_last4: '0000'
      });

    expect(verifyRes.status).toBe(400);
    expect(verifyRes.body.code).toBe('INVALID_RECOVERY_DETAILS');
  });
});
