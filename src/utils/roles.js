const ROLE = {
  ADMIN: 'admin',
  VENDOR: 'vendor',
  VIEWER: 'viewer',
  HR: 'hr',
  STAFF: 'staff',
  EMPLOYEE: 'employee'
};

function canonicalizeRole(role) {
  return role === ROLE.STAFF ? ROLE.VENDOR : role;
}

function isVendorLikeRole(role) {
  const canonicalRole = canonicalizeRole(role);
  return canonicalRole === ROLE.ADMIN || canonicalRole === ROLE.VENDOR;
}

function normalizeSessionUser(user) {
  if (!user) {
    return null;
  }

  return {
    ...user,
    role: canonicalizeRole(user.role)
  };
}

module.exports = {
  ROLE,
  canonicalizeRole,
  isVendorLikeRole,
  normalizeSessionUser
};