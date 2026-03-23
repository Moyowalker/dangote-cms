const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { User, Employee } = require('../database');
const { requireAuth } = require('../middleware/auth');
const { sendError } = require('../utils/apiResponse');
const { ROLE, normalizeSessionUser } = require('../utils/roles');

const router = express.Router();
const PASSWORD_RECOVERY_TTL_MS = 10 * 60 * 1000;

function hashRecoveryToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function normalizeDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function buildRecoveryError(res) {
  return sendError(res, 400, 'We could not verify those worker recovery details', 'INVALID_RECOVERY_DETAILS');
}

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

router.post('/password-recovery/verify', async (req, res) => {
  try {
    const {
      username,
      employee_number,
      badge_number,
      phone_last4
    } = req.body || {};

    if (
      typeof username !== 'string'
      || typeof employee_number !== 'string'
      || typeof badge_number !== 'string'
      || typeof phone_last4 !== 'string'
      || !username.trim()
      || !employee_number.trim()
      || !badge_number.trim()
      || !phone_last4.trim()
    ) {
      return sendError(
        res,
        400,
        'username, employee_number, badge_number, and phone_last4 are required',
        'VALIDATION_ERROR'
      );
    }

    const normalizedPhoneLast4 = normalizeDigits(phone_last4);
    if (normalizedPhoneLast4.length !== 4) {
      return sendError(res, 400, 'phone_last4 must contain exactly 4 digits', 'VALIDATION_ERROR');
    }

    const user = await User.findOne({ username: username.trim(), role: ROLE.EMPLOYEE });
    if (!user?.employee_id) {
      return buildRecoveryError(res);
    }

    const employee = await Employee.findById(user.employee_id);
    if (!employee) {
      return buildRecoveryError(res);
    }

    const employeePhoneDigits = normalizeDigits(employee.phone);
    if (
      employee.employee_number !== employee_number.trim()
      || employee.badge_number !== badge_number.trim()
      || employeePhoneDigits.length < 4
      || employeePhoneDigits.slice(-4) !== normalizedPhoneLast4
    ) {
      return buildRecoveryError(res);
    }

    const recoveryToken = crypto.randomBytes(24).toString('base64url');
    user.password_recovery_token_hash = hashRecoveryToken(recoveryToken);
    user.password_recovery_expires_at = new Date(Date.now() + PASSWORD_RECOVERY_TTL_MS);
    await user.save();

    return res.json({
      message: 'Worker identity verified. Set a new password before the recovery session expires.',
      recovery_token: recoveryToken,
      expires_at: user.password_recovery_expires_at.toISOString()
    });
  } catch (err) {
    console.error(err);
    return sendError(res, 500, 'Internal server error', 'INTERNAL_ERROR');
  }
});

router.post('/password-recovery/reset', async (req, res) => {
  try {
    const { recovery_token, new_password } = req.body || {};

    if (
      typeof recovery_token !== 'string'
      || typeof new_password !== 'string'
      || !recovery_token.trim()
      || !new_password.trim()
    ) {
      return sendError(res, 400, 'recovery_token and new_password are required', 'VALIDATION_ERROR');
    }

    const normalizedNewPassword = new_password.trim();
    if (normalizedNewPassword.length < 8) {
      return sendError(res, 400, 'new_password must be at least 8 characters long', 'VALIDATION_ERROR');
    }

    const hashedRecoveryToken = hashRecoveryToken(recovery_token.trim());
    const user = await User.findOne({ password_recovery_token_hash: hashedRecoveryToken, role: ROLE.EMPLOYEE });
    if (!user || !user.password_recovery_expires_at || new Date(user.password_recovery_expires_at).getTime() < Date.now()) {
      return sendError(res, 400, 'The recovery session is invalid or has expired', 'INVALID_RECOVERY_TOKEN');
    }

    const samePassword = await bcrypt.compare(normalizedNewPassword, user.password);
    if (samePassword) {
      return sendError(res, 400, 'New password must be different from the current password', 'VALIDATION_ERROR');
    }

    user.password = await bcrypt.hash(normalizedNewPassword, 10);
    user.password_recovery_token_hash = null;
    user.password_recovery_expires_at = null;
    await user.save();

    return res.json({ message: 'Password reset successfully. You can now sign in with the new password.' });
  } catch (err) {
    console.error(err);
    return sendError(res, 500, 'Internal server error', 'INTERNAL_ERROR');
  }
});

router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body || {};

    if (
      typeof current_password !== 'string'
      || typeof new_password !== 'string'
      || !current_password.trim()
      || !new_password.trim()
    ) {
      return sendError(res, 400, 'current_password and new_password are required', 'VALIDATION_ERROR');
    }

    const normalizedNewPassword = new_password.trim();
    if (normalizedNewPassword.length < 8) {
      return sendError(res, 400, 'new_password must be at least 8 characters long', 'VALIDATION_ERROR');
    }

    const user = await User.findById(req.session.user.id);
    if (!user) {
      return sendError(res, 404, 'User not found', 'NOT_FOUND');
    }

    const valid = await bcrypt.compare(current_password, user.password);
    if (!valid) {
      return sendError(res, 401, 'Current password is incorrect', 'INVALID_CREDENTIALS');
    }

    const samePassword = await bcrypt.compare(normalizedNewPassword, user.password);
    if (samePassword) {
      return sendError(res, 400, 'New password must be different from the current password', 'VALIDATION_ERROR');
    }

    user.password = await bcrypt.hash(normalizedNewPassword, 10);
  user.password_recovery_token_hash = null;
  user.password_recovery_expires_at = null;
    await user.save();

    return res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error(err);
    return sendError(res, 500, 'Internal server error', 'INTERNAL_ERROR');
  }
});

module.exports = router;
