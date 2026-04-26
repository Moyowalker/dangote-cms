const crypto = require('crypto');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const { Employee, User } = require('../database');
const { ROLE, canonicalizeRole } = require('../utils/roles');

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_STATUSES = ['active', 'suspended', 'deactivated'];
const PHOTO_DATA_URL_PATTERN = /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/i;
const MAX_PHOTO_DATA_URL_LENGTH = 150000;

function makeError(status, code, message) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function toBase64Url(buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function normalizeLifecycle({ status, active }) {
  let nextStatus = status;
  let nextActive = active;

  if (nextStatus !== undefined) {
    if (typeof nextStatus !== 'string' || !VALID_STATUSES.includes(nextStatus)) {
      throw makeError(400, 'VALIDATION_ERROR', `status must be one of: ${VALID_STATUSES.join(', ')}`);
    }
    nextActive = nextStatus === 'active';
  }

  if (nextActive !== undefined) {
    const boolActive = Boolean(nextActive);
    if (nextStatus === undefined) {
      nextStatus = boolActive ? 'active' : 'deactivated';
    }
    nextActive = boolActive;
  }

  return {
    status: nextStatus,
    active: nextActive
  };
}

function applyRoleScope(baseFilter, user) {
  const scoped = { ...baseFilter };
  const role = canonicalizeRole(user && user.role);

  if (!user || !role) {
    throw makeError(401, 'AUTH_REQUIRED', 'Authentication required');
  }

  if (role === ROLE.ADMIN) {
    return scoped;
  }

  if (role === ROLE.VIEWER || role === ROLE.HR) {
    return scoped;
  }

  if (role === ROLE.VENDOR) {
    scoped.active = true;
    return scoped;
  }

  if (role === ROLE.EMPLOYEE) {
    if (!user.employee_id || !mongoose.Types.ObjectId.isValid(user.employee_id)) {
      throw makeError(403, 'FORBIDDEN', 'Employee account is not linked to an employee profile');
    }
    scoped._id = user.employee_id;
    return scoped;
  }

  throw makeError(403, 'FORBIDDEN', 'Role is not permitted to access employee records');
}

function buildSearchFilter(search) {
  return {
    $or: [
      { name: { $regex: search, $options: 'i' } },
      { worker_identifier: { $regex: search, $options: 'i' } },
      { employee_number: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ]
  };
}

function normalizeOptionalString(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function validatePhotoDataUrl(photoDataUrl) {
  if (photoDataUrl === undefined) {
    return undefined;
  }

  const normalized = normalizeOptionalString(photoDataUrl);
  if (normalized === null) {
    return null;
  }

  if (typeof normalized !== 'string') {
    throw makeError(400, 'VALIDATION_ERROR', 'photo_data_url must be a string');
  }

  if (!PHOTO_DATA_URL_PATTERN.test(normalized)) {
    throw makeError(400, 'VALIDATION_ERROR', 'photo_data_url must be a PNG, JPEG, or WebP data URL');
  }

  if (normalized.length > MAX_PHOTO_DATA_URL_LENGTH) {
    throw makeError(400, 'VALIDATION_ERROR', 'photo_data_url is too large');
  }

  return normalized;
}

function getEmployeeCategoryId(input) {
  if (!input || typeof input !== 'object') {
    return undefined;
  }

  if (input.employee_category_id !== undefined) {
    return input.employee_category_id;
  }

  return input.worker_category_id;
}

async function listEmployees({ query, user }) {
  const { search, department } = query;
  const filter = {};

  if (search) {
    Object.assign(filter, buildSearchFilter(search));
  }
  if (department) {
    filter.department = department;
  }

  const scopedFilter = applyRoleScope(filter, user);

  return Employee.find(scopedFilter)
    .populate('meal_plan_id', 'name')
    .populate('worker_category_id', 'name code')
    .sort({ name: 1 });
}

async function createEmployee(payload) {
  const {
    employee_number,
    name,
    department,
    email,
    phone,
    photo_data_url,
    badge_number,
    meal_plan_id,
    status,
    active
  } = payload;
  const employeeCategoryId = getEmployeeCategoryId(payload);

  if (
    typeof employee_number !== 'string' ||
    typeof name !== 'string' ||
    typeof department !== 'string' ||
    typeof badge_number !== 'string' ||
    !employee_number.trim() ||
    !name.trim() ||
    !department.trim() ||
    !badge_number.trim()
  ) {
    throw makeError(400, 'VALIDATION_ERROR', 'employee_number, name, department, and badge_number are required');
  }

  if (email !== undefined && email !== null && (typeof email !== 'string' || !emailPattern.test(email))) {
    throw makeError(400, 'VALIDATION_ERROR', 'email must be a valid email address');
  }

  if (meal_plan_id !== undefined && meal_plan_id !== null && !mongoose.Types.ObjectId.isValid(meal_plan_id)) {
    throw makeError(400, 'VALIDATION_ERROR', 'meal_plan_id is invalid');
  }

  if (employeeCategoryId !== undefined && employeeCategoryId !== null && !mongoose.Types.ObjectId.isValid(employeeCategoryId)) {
    throw makeError(400, 'VALIDATION_ERROR', 'employee_category_id is invalid');
  }

  const lifecycle = normalizeLifecycle({ status, active });
  const normalizedPhotoDataUrl = validatePhotoDataUrl(photo_data_url);

  try {
    return await Employee.create({
      worker_identifier: employee_number.trim(),
      employee_number: employee_number.trim(),
      name: name.trim(),
      department: department.trim(),
      email: email || null,
      phone: phone || null,
      photo_data_url: normalizedPhotoDataUrl === undefined ? null : normalizedPhotoDataUrl,
      badge_number: badge_number.trim(),
      meal_plan_id: meal_plan_id || null,
      worker_category_id: employeeCategoryId || null,
      status: lifecycle.status || 'active',
      active: lifecycle.active !== undefined ? lifecycle.active : true
    });
  } catch (err) {
    if (err.code === 11000) {
      throw makeError(409, 'CONFLICT', 'Employee number, email, or badge number already exists');
    }
    throw err;
  }
}

async function getEmployeeById(id, user) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw makeError(404, 'NOT_FOUND', 'Employee not found');
  }

  const role = canonicalizeRole(user.role);

  if (role === ROLE.EMPLOYEE) {
    if (!user.employee_id || String(user.employee_id) !== String(id)) {
      throw makeError(403, 'FORBIDDEN', 'Employees can only access their own record');
    }
  }

  const employee = await Employee.findById(id)
    .populate('meal_plan_id', 'name')
    .populate('worker_category_id', 'name code');

  if (!employee) {
    throw makeError(404, 'NOT_FOUND', 'Employee not found');
  }

  if (role === ROLE.VENDOR && employee.active === false) {
    throw makeError(403, 'FORBIDDEN', 'Vendor cannot access inactive employee records');
  }

  return employee;
}

async function updateEmployee(id, payload) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw makeError(404, 'NOT_FOUND', 'Employee not found');
  }

  const {
    employee_number,
    name,
    department,
    email,
    phone,
    photo_data_url,
    badge_number,
    meal_plan_id,
    status,
    active
  } = payload;
  const employeeCategoryId = getEmployeeCategoryId(payload);

  const updates = {};

  if (employee_number !== undefined) {
    if (typeof employee_number !== 'string' || !employee_number.trim()) {
      throw makeError(400, 'VALIDATION_ERROR', 'employee_number must be a non-empty string');
    }
    updates.employee_number = employee_number.trim();
    updates.worker_identifier = employee_number.trim();
  }
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      throw makeError(400, 'VALIDATION_ERROR', 'name must be a non-empty string');
    }
    updates.name = name.trim();
  }
  if (department !== undefined) {
    if (typeof department !== 'string' || !department.trim()) {
      throw makeError(400, 'VALIDATION_ERROR', 'department must be a non-empty string');
    }
    updates.department = department.trim();
  }
  if (email !== undefined && email !== null && (typeof email !== 'string' || !emailPattern.test(email))) {
    throw makeError(400, 'VALIDATION_ERROR', 'email must be a valid email address');
  }
  if (email !== undefined) updates.email = email;
  if (phone !== undefined) updates.phone = phone;
  if (photo_data_url !== undefined) updates.photo_data_url = validatePhotoDataUrl(photo_data_url);

  if (badge_number !== undefined) {
    if (typeof badge_number !== 'string' || !badge_number.trim()) {
      throw makeError(400, 'VALIDATION_ERROR', 'badge_number must be a non-empty string');
    }
    updates.badge_number = badge_number.trim();
  }

  if (meal_plan_id !== undefined) {
    if (meal_plan_id !== null && !mongoose.Types.ObjectId.isValid(meal_plan_id)) {
      throw makeError(400, 'VALIDATION_ERROR', 'meal_plan_id is invalid');
    }
    updates.meal_plan_id = meal_plan_id;
  }

  if (employeeCategoryId !== undefined) {
    if (employeeCategoryId !== null && !mongoose.Types.ObjectId.isValid(employeeCategoryId)) {
      throw makeError(400, 'VALIDATION_ERROR', 'employee_category_id is invalid');
    }
    updates.worker_category_id = employeeCategoryId;
  }

  const lifecycle = normalizeLifecycle({ status, active });
  if (lifecycle.status !== undefined) updates.status = lifecycle.status;
  if (lifecycle.active !== undefined) updates.active = lifecycle.active;

  try {
    const updated = await Employee.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    )
      .populate('meal_plan_id', 'name')
      .populate('worker_category_id', 'name code');

    if (!updated) {
      throw makeError(404, 'NOT_FOUND', 'Employee not found');
    }

    return updated;
  } catch (err) {
    if (err.code === 11000) {
      throw makeError(409, 'CONFLICT', 'Employee number, email, or badge number already exists');
    }
    throw err;
  }
}

async function deleteEmployee(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw makeError(404, 'NOT_FOUND', 'Employee not found');
  }

  await User.deleteMany({ employee_id: id, role: ROLE.EMPLOYEE });
  const deleted = await Employee.findByIdAndDelete(id);
  if (!deleted) {
    throw makeError(404, 'NOT_FOUND', 'Employee not found');
  }

  return deleted;
}

async function getEmployeePortalAccess(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw makeError(404, 'NOT_FOUND', 'Employee not found');
  }

  const employee = await Employee.findById(id);
  if (!employee) {
    throw makeError(404, 'NOT_FOUND', 'Employee not found');
  }

  const linkedUser = await User.findOne({ employee_id: employee._id, role: ROLE.EMPLOYEE });

  return {
    enabled: Boolean(linkedUser),
    username: linkedUser?.username || employee.employee_number,
    employee_id: employee.id,
    employee_number: employee.employee_number,
    worker_name: employee.name
  };
}

function generateTemporaryPassword() {
  return toBase64Url(crypto.randomBytes(9));
}

async function provisionEmployeePortalAccess(id, payload = {}) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw makeError(404, 'NOT_FOUND', 'Employee not found');
  }

  const employee = await Employee.findById(id);
  if (!employee) {
    throw makeError(404, 'NOT_FOUND', 'Employee not found');
  }

  const requestedUsername = payload.username === undefined ? employee.employee_number : payload.username;
  if (typeof requestedUsername !== 'string' || !requestedUsername.trim()) {
    throw makeError(400, 'VALIDATION_ERROR', 'username must be a non-empty string');
  }

  const normalizedUsername = requestedUsername.trim();
  const requestedPassword = payload.password;
  if (requestedPassword !== undefined && (typeof requestedPassword !== 'string' || !requestedPassword.trim())) {
    throw makeError(400, 'VALIDATION_ERROR', 'password must be a non-empty string when provided');
  }

  const temporaryPassword = typeof requestedPassword === 'string' && requestedPassword.trim()
    ? requestedPassword.trim()
    : generateTemporaryPassword();

  const existingByUsername = await User.findOne({ username: normalizedUsername });
  const linkedUser = await User.findOne({ employee_id: employee._id, role: ROLE.EMPLOYEE });

  if (existingByUsername && (!linkedUser || String(existingByUsername.id) !== String(linkedUser.id))) {
    throw makeError(409, 'CONFLICT', 'That username is already in use');
  }

  const hashedPassword = await bcrypt.hash(temporaryPassword, 10);
  try {
    if (linkedUser) {
      linkedUser.username = normalizedUsername;
      linkedUser.password = hashedPassword;
      linkedUser.password_recovery_token_hash = null;
      linkedUser.password_recovery_expires_at = null;
      await linkedUser.save();
    } else {
      await User.create({
        username: normalizedUsername,
        password: hashedPassword,
        role: ROLE.EMPLOYEE,
        employee_id: employee._id,
        password_recovery_token_hash: null,
        password_recovery_expires_at: null
      });
    }
  } catch (err) {
    if (err && err.code === 11000) {
      throw makeError(409, 'CONFLICT', 'That username is already in use');
    }

    throw err;
  }

  return {
    enabled: true,
    username: normalizedUsername,
    temporary_password: temporaryPassword,
    employee_id: employee.id,
    employee_number: employee.employee_number,
    worker_name: employee.name
  };
}

async function revokeEmployeePortalAccess(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw makeError(404, 'NOT_FOUND', 'Employee not found');
  }

  const employee = await Employee.findById(id);
  if (!employee) {
    throw makeError(404, 'NOT_FOUND', 'Employee not found');
  }

  await User.deleteMany({ employee_id: employee._id, role: ROLE.EMPLOYEE });

  return {
    enabled: false,
    employee_id: employee.id,
    employee_number: employee.employee_number,
    worker_name: employee.name
  };
}

module.exports = {
  VALID_STATUSES,
  listEmployees,
  createEmployee,
  getEmployeeById,
  updateEmployee,
  deleteEmployee,
  getEmployeePortalAccess,
  provisionEmployeePortalAccess,
  revokeEmployeePortalAccess,
  makeError
};