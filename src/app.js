const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { doubleCsrf } = require('csrf-csrf');
const path = require('path');
const { initializeDatabase, Employee, MealRecord, MealPlan } = require('./database');

const authRoutes = require('./routes/auth');
const employeeRoutes = require('./routes/employees');
const mealRoutes = require('./routes/meals');
const ticketRoutes = require('./routes/tickets');
const reportRoutes = require('./routes/reports');
const { requireAuth } = require('./middleware/auth');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.' }
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
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

const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => process.env.SESSION_SECRET || 'dangote-cms-secret-2024',
  getSessionIdentifier: (req) => req.sessionID || req.ip || 'anonymous',
  cookieName: 'csrf-token',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    httpOnly: false
  },
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  getCsrfTokenFromRequest: (req) => req.headers['x-csrf-token']
});

const csrfMiddleware = process.env.NODE_ENV === 'test'
  ? (req, res, next) => next()
  : doubleCsrfProtection;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/csrf-token', (req, res) => {
  res.json({ csrfToken: generateCsrfToken(req, res) });
});

app.use('/api/auth/login', loginLimiter);
app.use('/api', apiLimiter);
// Apply CSRF protection to all state-mutating API routes except login
// (login is the unauthenticated entry-point, so there is no existing session
// token to double-submit, and the CSRF cookie is set on the GET /api/csrf-token call)
app.use('/api', (req, res, next) => {
  if (req.path === '/auth/login' && req.method === 'POST') return next();
  csrfMiddleware(req, res, next);
});
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api', mealRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/reports', reportRoutes);

app.get('/api/dashboard/stats', requireAuth, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const thisMonth = today.substring(0, 7);
    // thisMonth is machine-generated (YYYY-MM) — escape defensively
    const safeMonth = thisMonth.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const [totalEmployees, mealsToday, mealsThisMonth, recentRecords, activePlans] = await Promise.all([
      Employee.countDocuments({ active: true }),
      MealRecord.countDocuments({ consumption_date: today }),
      MealRecord.countDocuments({ consumption_date: { $regex: `^${safeMonth}` } }),
      MealRecord.find()
        .populate('employee_id', 'name employee_number')
        .sort({ consumed_at: -1 })
        .limit(10),
      MealPlan.countDocuments({ active: true })
    ]);

    const recentActivity = recentRecords.map((r) => ({
      ...r.toJSON(),
      employee_name: r.employee_id ? r.employee_id.name : null,
      employee_number: r.employee_id ? r.employee_id.employee_number : null,
      employee_id: r.employee_id ? r.employee_id._id.toString() : null
    }));

    res.json({ totalEmployees, mealsToday, mealsThisMonth, activePlans, recentActivity });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.redirect('/index.html');
});

module.exports = app;
