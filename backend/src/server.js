require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
const workersRoutes = require('./routes/workers');
const ticketsRoutes = require('./routes/tickets');
const vendorsRoutes = require('./routes/vendors');
const reportsRoutes = require('./routes/reports');

const app = express();

app.use(cors());
app.use(express.json());

// Rate limiting: stricter for auth, general for other API routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later' }
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false
});

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/workers', apiLimiter, workersRoutes);
app.use('/api/tickets', apiLimiter, ticketsRoutes);
app.use('/api/vendors', apiLimiter, vendorsRoutes);
app.use('/api/reports', apiLimiter, reportsRoutes);

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use(errorHandler);

const PORT = process.env.PORT || 3001;

// Only start listening if not in test mode
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Dangote CMS Backend running on port ${PORT}`);
  });
}

module.exports = app;
