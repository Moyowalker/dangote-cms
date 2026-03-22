const { sendError } = require('../utils/apiResponse');
const { ROLE, canonicalizeRole } = require('../utils/roles');

function hasAnyRole(req, roles) {
  return Boolean(
    req.session
      && req.session.user
      && roles.includes(canonicalizeRole(req.session.user.role))
  );
}

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
  if (!hasAnyRole(req, [ROLE.ADMIN])) {
    return sendError(res, 403, 'Admin access required', 'FORBIDDEN');
  }
  next();
}

function requireStaff(req, res, next) {
  if (!req.session || !req.session.user) {
    return sendError(res, 401, 'Authentication required', 'AUTH_REQUIRED');
  }
  if (!hasAnyRole(req, [ROLE.ADMIN, ROLE.VENDOR])) {
    return sendError(res, 403, 'Vendor access required', 'FORBIDDEN');
  }
  next();
}

function requireReportViewer(req, res, next) {
  if (!req.session || !req.session.user) {
    return sendError(res, 401, 'Authentication required', 'AUTH_REQUIRED');
  }
  if (!hasAnyRole(req, [ROLE.ADMIN, ROLE.VIEWER, ROLE.HR])) {
    return sendError(res, 403, 'Report access required', 'FORBIDDEN');
  }
  next();
}

module.exports = { ROLE, requireAuth, requireAdmin, requireStaff, requireReportViewer };
