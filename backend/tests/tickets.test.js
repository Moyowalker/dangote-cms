const request = require('supertest');
process.env.NODE_ENV = 'test';
const app = require('../src/server');
const db = require('../src/config/database');

let adminToken;
let vendorToken;
let testWorkerId;
let issuedTicketCode;
const today = new Date().toISOString().split('T')[0];

beforeAll(async () => {
  const adminRes = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'Admin@123' });
  adminToken = adminRes.body.token;

  const vendorRes = await request(app)
    .post('/api/auth/login')
    .send({ username: 'vendor1', password: 'Vendor@123' });
  vendorToken = vendorRes.body.token;

  // Create a test worker
  const workerRes = await request(app)
    .post('/api/workers')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      employee_id: 'TICKTEST001',
      name: 'Ticket Test Worker',
      department: 'Testing',
      meal_plan: 'all'
    });
  testWorkerId = workerRes.body.id;
});

afterAll(() => {
  // Clean up
  if (testWorkerId) {
    db.prepare('DELETE FROM transactions WHERE ticket_id IN (SELECT id FROM meal_tickets WHERE worker_id = ?)').run(testWorkerId);
    db.prepare('DELETE FROM meal_tickets WHERE worker_id = ?').run(testWorkerId);
    db.prepare('DELETE FROM workers WHERE employee_id = ?').run('TICKTEST001');
  }
});

describe('Tickets Routes', () => {
  it('POST /api/tickets/issue creates ticket', async () => {
    const res = await request(app)
      .post('/api/tickets/issue')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        worker_id: testWorkerId,
        meal_type: 'lunch',
        valid_date: today
      });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('ticket_code');
    expect(res.body.meal_type).toBe('lunch');
    expect(res.body.status).toBe('pending');
    issuedTicketCode = res.body.ticket_code;
  });

  it('GET /api/tickets returns list', async () => {
    const res = await request(app)
      .get('/api/tickets')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/vendors/redeem redeems ticket successfully', async () => {
    const res = await request(app)
      .post('/api/vendors/redeem')
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({ ticket_code: issuedTicketCode });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Ticket redeemed successfully');
    expect(res.body.ticket.status).toBe('used');
  });

  it('POST /api/vendors/redeem already used ticket returns 400', async () => {
    const res = await request(app)
      .post('/api/vendors/redeem')
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({ ticket_code: issuedTicketCode });
    expect(res.status).toBe(400);
  });

  it('POST /api/vendors/redeem with invalid code returns 404', async () => {
    const res = await request(app)
      .post('/api/vendors/redeem')
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({ ticket_code: 'invalid-ticket-code-00000000' });
    expect(res.status).toBe(404);
  });

  it('GET /api/tickets/:id returns a single ticket', async () => {
    const listRes = await request(app)
      .get('/api/tickets')
      .set('Authorization', `Bearer ${adminToken}`);
    const ticket = listRes.body[0];

    const res = await request(app)
      .get(`/api/tickets/${ticket.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(ticket.id);
  });

  it('GET /api/tickets/:id returns 404 for unknown ticket', async () => {
    const res = await request(app)
      .get('/api/tickets/999999')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it('GET /api/reports/worker/:id returns worker ticket history', async () => {
    const res = await request(app)
      .get(`/api/reports/worker/${testWorkerId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('worker');
    expect(res.body).toHaveProperty('tickets');
    expect(Array.isArray(res.body.tickets)).toBe(true);
  });

  it('POST /api/tickets/batch-issue issues multiple tickets', async () => {
    const workers = db.prepare('SELECT id FROM workers WHERE active = 1 LIMIT 3').all();
    const worker_ids = workers.map(w => w.id);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const res = await request(app)
      .post('/api/tickets/batch-issue')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        worker_ids,
        meal_type: 'breakfast',
        valid_date: tomorrowStr
      });
    expect(res.status).toBe(201);
    expect(res.body.issued).toBe(worker_ids.length);
  });
});
