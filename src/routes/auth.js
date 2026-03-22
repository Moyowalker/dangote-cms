const express = require('express');
const bcrypt = require('bcrypt');
const { User } = require('../database');
const { requireAuth } = require('../middleware/auth');
const { sendError } = require('../utils/apiResponse');
const { normalizeSessionUser } = require('../utils/roles');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password.trim()) {
      return sendError(res, 400, 'Username and password required', 'VALIDATION_ERROR');
    }

    const normalizedUsername = username.trim();
    const user = await User.findOne({ username: normalizedUsername });
    if (!user) {
      return sendError(res, 401, 'Invalid credentials', 'INVALID_CREDENTIALS');
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return sendError(res, 401, 'Invalid credentials', 'INVALID_CREDENTIALS');
    }
    req.session.user = normalizeSessionUser({
      id: user.id,
      username: user.username,
      role: user.role,
      employee_id: user.employee_id || null
    });
    res.json({
      user: req.session.user
    });
  } catch (err) {
    console.error(err);
    sendError(res, 500, 'Internal server error', 'INTERNAL_ERROR');
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return sendError(res, 500, 'Could not log out', 'SESSION_ERROR');
    }
    res.json({ message: 'Logged out successfully' });
  });
});

router.get('/me', requireAuth, (req, res) => {
  req.session.user = normalizeSessionUser(req.session.user);
  res.json({ user: req.session.user });
});

module.exports = router;
