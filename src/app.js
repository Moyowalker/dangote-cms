const express = require('express');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { initializeDatabase, getDb } = require('./database');

const authRoutes = require('./routes/auth');
const employeeRoutes = require('./routes/employees');
const mealRoutes = require('./routes/meals');
const ticketRoutes = require('./routes/tickets');
const reportRoutes = require('./routes/reports');
const { requireAuth } = require('./middleware/auth');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.' }
});

app.use(session({
  secret: process.env.SESSION_SECRET || 'dangote-cms-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api', mealRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/reports', reportRoutes);

app.get('/api/dashboard/stats', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const totalEmployees = db.prepare('SELECT COUNT(*) as count FROM employees WHERE active = 1').get().count;
    const today = new Date().toISOString().split('T')[0];
    const mealsToday = db.prepare('SELECT COUNT(*) as count FROM meal_records WHERE consumption_date = ?').get(today).count;
    const thisMonth = today.substring(0, 7);
    const mealsThisMonth = db.prepare("SELECT COUNT(*) as count FROM meal_records WHERE strftime('%Y-%m', consumption_date) = ?").get(thisMonth).count;
    const recentActivity = db.prepare(`
      SELECT mr.*, e.name as employee_name, e.employee_number
      FROM meal_records mr
      JOIN employees e ON e.id = mr.employee_id
      ORDER BY mr.consumed_at DESC
      LIMIT 10
    `).all();
    res.json({ totalEmployees, mealsToday, mealsThisMonth, recentActivity });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.redirect('/index.html');
});

module.exports = app;
