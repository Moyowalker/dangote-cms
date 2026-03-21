const { sendError } = require('../utils/apiResponse');

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return sendError(res, 401, 'Authentication required', 'AUTH_REQUIRED');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user) {
    return sendError(res, 401, 'Authentication required', 'AUTH_REQUIRED');
  }
  if (req.session.user.role !== 'admin') {
    return sendError(res, 403, 'Admin access required', 'FORBIDDEN');
  }
  next();
}

function requireStaff(req, res, next) {
  if (!req.session || !req.session.user) {
    return sendError(res, 401, 'Authentication required', 'AUTH_REQUIRED');
  }
  if (req.session.user.role !== 'admin' && req.session.user.role !== 'staff') {
    return sendError(res, 403, 'Staff access required', 'FORBIDDEN');
  }
  next();
}

module.exports = { requireAuth, requireAdmin, requireStaff };
