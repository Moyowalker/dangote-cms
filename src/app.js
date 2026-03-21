const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { doubleCsrf } = require('csrf-csrf');
const path = require('path');
const mongoose = require('mongoose');
const { initializeDatabase, Employee, MealRecord, MealPlan } = require('./database');

const isTest = process.env.NODE_ENV === 'test';
const isProduction = process.env.NODE_ENV === 'production';

// Fail fast in production when SESSION_SECRET is not explicitly configured
if (isProduction && !process.env.SESSION_SECRET) {
  console.error('FATAL: SESSION_SECRET environment variable is required in production');
  process.exit(1);
}

const authRoutes = require('./routes/auth');
const employeeRoutes = require('./routes/employees');
const mealRoutes = require('./routes/meals');
const entitlementRoutes = require('./routes/entitlements');
const ticketRoutes = require('./routes/tickets');
const reportRoutes = require('./routes/reports');
const reconciliationRoutes = require('./routes/reconciliation');
const { requireAuth } = require('./middleware/auth');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Disable rate limiting in tests to prevent flaky test suites
const noop = (req, res, next) => next();

const loginLimiter = isTest
  ? noop
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 20,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many login attempts, please try again later.' }
    });

const apiLimiter = isTest
  ? noop
  : rateLimit({
      windowMs: 60 * 1000,
      max: 300,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests, please try again later.' }
    });

// Trust the first hop from a reverse proxy (needed for secure cookies behind TLS termination)
if (isProduction) {
  app.set('trust proxy', 1);
}

app.use(session({
  secret: process.env.SESSION_SECRET || 'dangote-cms-secret-dev',
  resave: false,
  saveUninitialized: false,
  // Use MongoDB-backed session store in non-test environments
  store: isTest
    ? undefined
    : MongoStore.create({
        mongoUrl: process.env.MONGO_URI || 'mongodb://localhost:27017/dangote-cms',
        ttl: 24 * 60 * 60
      }),
  cookie: {
    secure: isProduction,
    sameSite: 'strict'
  }
}));

const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => process.env.SESSION_SECRET || 'dangote-cms-secret-dev',
  getSessionIdentifier: (req) => req.sessionID || req.ip || 'anonymous',
  cookieName: 'csrf-token',
  cookieOptions: {
    secure: isProduction,
    sameSite: 'strict',
    // httpOnly: true — token is read server-side from the cookie,
    // not by client JS, so httpOnly is safe here
    httpOnly: true
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

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'dangote-cms-backend' });
});

app.get('/api/readiness', (req, res) => {
  if (isTest) {
    return res.json({
      status: 'ready',
      checks: {
        database: 'up'
      }
    });
  }

  const dbConnected = mongoose.connection.readyState === 1;

  if (!dbConnected) {
    return res.status(503).json({
      status: 'not_ready',
      checks: {
        database: 'down'
      }
    });
  }

  return res.json({
    status: 'ready',
    checks: {
      database: 'up'
    }
  });
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
app.use('/api', entitlementRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/reconciliation', reconciliationRoutes);

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
    console.error('Dashboard stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
  res.redirect('/index.html');
});

module.exports = app;
