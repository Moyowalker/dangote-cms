process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../src/app');
const { initializeDatabase, closeDatabase, getDb } = require('../src/database');

let agent;

beforeAll(() => {
  initializeDatabase();
  agent = request.agent(app);
});

beforeEach(async () => {
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
  const db = getDb();
  db.prepare('DELETE FROM menu_items').run();
  db.prepare('DELETE FROM meal_plans').run();
});

afterAll(() => {
  closeDatabase();
});

describe('Meals Routes', () => {
  test('GET /api/meal-plans requires auth', async () => {
    const res = await request(app).get('/api/meal-plans');
    expect(res.status).toBe(401);
  });

  test('POST /api/meal-plans creates a meal plan', async () => {
    const res = await agent.post('/api/meal-plans').send({
      name: 'Standard Plan',
      description: 'Breakfast and lunch',
      breakfast: 1,
      lunch: 1,
      dinner: 0
    });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Standard Plan');
  });

  test('PUT /api/meal-plans/:id updates a meal plan', async () => {
    const createRes = await agent.post('/api/meal-plans').send({
      name: 'Basic Plan',
      breakfast: 1,
      lunch: 1,
      dinner: 0
    });
    const id = createRes.body.id;
    const res = await agent.put(`/api/meal-plans/${id}`).send({ name: 'Premium Plan', dinner: 1 });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Premium Plan');
    expect(res.body.dinner).toBe(1);
  });

  test('DELETE /api/meal-plans/:id deletes a meal plan', async () => {
    const createRes = await agent.post('/api/meal-plans').send({ name: 'Temp Plan', breakfast: 1, lunch: 1, dinner: 0 });
    const id = createRes.body.id;
    const res = await agent.delete(`/api/meal-plans/${id}`);
    expect(res.status).toBe(200);
  });

  test('POST /api/menu-items creates a menu item', async () => {
    const res = await agent.post('/api/menu-items').send({
      name: 'Rice and Beans',
      meal_type: 'lunch',
      price: 500,
      available_date: '2024-01-15'
    });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Rice and Beans');
  });

  test('GET /api/menu-items returns items', async () => {
    await agent.post('/api/menu-items').send({
      name: 'Jollof Rice',
      meal_type: 'lunch',
      price: 600,
      available_date: '2024-01-15'
    });
    const res = await agent.get('/api/menu-items');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });
});
