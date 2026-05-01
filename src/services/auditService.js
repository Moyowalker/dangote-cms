const { AuditLog } = require('../database');
const crypto = require('crypto');

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const EXCLUDED_AUDIT_PREFIXES = ['/api/tickets', '/api/reconciliation'];
const REDACTED_PLACEHOLDER = '[REDACTED]';
const SENSITIVE_KEYS = new Set([
  'password',
  'current_password',
  'new_password',
  'recovery_token',
  'password_recovery_token_hash',
  'temporary_password',
  'token',
  'csrfToken',
  'csrf_token'
]);

function computeAuditHash(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

async function getPreviousHash() {
  const logs = await AuditLog.find({});
  if (!Array.isArray(logs) || logs.length === 0) {
    return null;
  }
  const last = logs[logs.length - 1];
  return last.hash || null;
}

async function writeAuditLog(entry) {
  const created_at = new Date().toISOString();
  const prev_hash = await getPreviousHash();
  const hash = computeAuditHash({
    prev_hash,
    created_at,
    actor_user_id: entry.actor_user_id || null,
    actor_role: entry.actor_role || null,
    action: entry.action,
    entity_type: entry.entity_type,
    entity_id: entry.entity_id || null,
    outcome: entry.outcome,
    reason: entry.reason || null,
    metadata: entry.metadata || {}
  });

  return AuditLog.create({
    created_at,
    actor_user_id: entry.actor_user_id || null,
    actor_role: entry.actor_role || null,
    action: entry.action,
    entity_type: entry.entity_type,
    entity_id: entry.entity_id || null,
    outcome: entry.outcome,
    reason: entry.reason || null,
    metadata: entry.metadata || {},
    prev_hash,
    hash
  });
}

async function safeWriteAuditLog(entry) {
  try {
    await writeAuditLog(entry);
  } catch (err) {
    // Audit should not block operational flow.
    console.error('Audit write failed:', err);
  }
}

function redactAuditValue(value) {
  if (Array.isArray(value)) {
    return value.map(redactAuditValue);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.entries(value).reduce((accumulator, [key, nestedValue]) => {
    accumulator[key] = SENSITIVE_KEYS.has(key)
      ? REDACTED_PLACEHOLDER
      : redactAuditValue(nestedValue);
    return accumulator;
  }, {});
}

function normalizeAuditPath(originalUrl) {
  return String(originalUrl || '').split('?')[0] || '/';
}

function normalizeEntityType(rawValue) {
  const normalized = String(rawValue || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!normalized) {
    return 'resource';
  }

  if (normalized.endsWith('ies')) {
    return `${normalized.slice(0, -3)}y`;
  }

  if (normalized.endsWith('s')) {
    return normalized.slice(0, -1);
  }

  return normalized;
}

function getAuditRouteDetails(req) {
  const path = normalizeAuditPath(req.originalUrl);
  const segments = path.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const [first = 'api', second = '', third = ''] = segments;

  if (first === 'auth') {
    if (second === 'login') {
      return { action: 'auth.login', entityType: 'session', entityId: null };
    }
    if (second === 'logout') {
      return { action: 'auth.logout', entityType: 'session', entityId: null };
    }
    if (second === 'change-password') {
      return { action: 'auth.password_change', entityType: 'user_account', entityId: req.session?.user?.id || null };
    }
    if (second === 'password-recovery' && third === 'verify') {
      return { action: 'auth.password_recovery_verify', entityType: 'password_recovery', entityId: null };
    }
    if (second === 'password-recovery' && third === 'reset') {
      return { action: 'auth.password_recovery_reset', entityType: 'password_recovery', entityId: null };
    }
  }

  if (first === 'employees' && third === 'portal-access') {
    return {
      action: req.method === 'DELETE' ? 'employee.portal_access.revoke' : 'employee.portal_access.provision',
      entityType: 'employee_portal_access',
      entityId: req.params?.id || second || null
    };
  }

  if (first === 'employees' && third === 'category') {
    return {
      action: 'employee.category.assign',
      entityType: 'employee_category_assignment',
      entityId: req.params?.id || second || null
    };
  }

  const entityTypeMap = {
    employees: 'employee',
    'meal-plans': 'meal_plan',
    'menu-items': 'menu_item',
    'worker-categories': 'employee_category',
    'employee-categories': 'employee_category',
    'entitlement-policies': 'entitlement_policy'
  };

  const entityType = entityTypeMap[first] || normalizeEntityType(first);
  const verbMap = {
    POST: 'create',
    PUT: 'update',
    PATCH: 'update',
    DELETE: 'delete'
  };

  return {
    action: `${entityType}.${verbMap[req.method] || 'mutate'}`,
    entityType,
    entityId: req.params?.id || second || null
  };
}

function shouldCaptureRequestAudit(req) {
  const path = normalizeAuditPath(req.originalUrl);
  return MUTATING_METHODS.has(req.method)
    && path.startsWith('/api/')
    && !EXCLUDED_AUDIT_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function buildRequestAuditEntry(req, res, responseBody, actorSnapshot = null) {
  if (!shouldCaptureRequestAudit(req)) {
    return null;
  }

  const routeDetails = getAuditRouteDetails(req);
  const actor = req.session?.user || actorSnapshot || null;
  const sanitizedRequestBody = redactAuditValue(req.body || {});
  const sanitizedResponseBody = redactAuditValue(responseBody || {});
  const derivedEntityId = routeDetails.entityId
    || sanitizedResponseBody?.id
    || sanitizedResponseBody?.entity_id
    || null;
  const failureReason = sanitizedResponseBody?.error || sanitizedResponseBody?.message || null;

  return {
    actor_user_id: actor?.id || null,
    actor_role: actor?.role || null,
    action: routeDetails.action,
    entity_type: routeDetails.entityType,
    entity_id: derivedEntityId ? String(derivedEntityId) : null,
    outcome: res.statusCode >= 400 ? 'failure' : 'success',
    reason: res.statusCode >= 400 ? failureReason : null,
    metadata: {
      request_id: req.requestId || null,
      method: req.method,
      path: normalizeAuditPath(req.originalUrl),
      status_code: res.statusCode,
      params: redactAuditValue(req.params || {}),
      query: redactAuditValue(req.query || {}),
      request_body: sanitizedRequestBody,
      response_body: sanitizedResponseBody && typeof sanitizedResponseBody === 'object'
        ? {
            id: sanitizedResponseBody.id || null,
            code: sanitizedResponseBody.code || null,
            error: sanitizedResponseBody.error || null,
            message: sanitizedResponseBody.message || null
          }
        : null
    }
  };
}

function parseAuditTimestamp(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

async function listAuditLogs(filters = {}) {
  const records = await AuditLog.find({});
  const allEntries = Array.isArray(records) ? records.map((record) => (record.toJSON ? record.toJSON() : { ...record })) : [];

  const filtered = allEntries.filter((entry) => {
    const createdAt = String(entry.created_at || '');
    const createdDate = createdAt.split('T')[0];

    if (filters.date && createdDate !== filters.date) {
      return false;
    }

    if (filters.start_date && createdDate < filters.start_date) {
      return false;
    }

    if (filters.end_date && createdDate > filters.end_date) {
      return false;
    }

    if (filters.action && entry.action !== filters.action) {
      return false;
    }

    if (filters.entity_type && entry.entity_type !== filters.entity_type) {
      return false;
    }

    if (filters.actor_role && entry.actor_role !== filters.actor_role) {
      return false;
    }

    if (filters.outcome && entry.outcome !== filters.outcome) {
      return false;
    }

    if (filters.request_id && entry.metadata?.request_id !== filters.request_id) {
      return false;
    }

    return true;
  }).sort((left, right) => parseAuditTimestamp(right.created_at) - parseAuditTimestamp(left.created_at));

  const summary = filtered.reduce((accumulator, entry) => {
    accumulator.total += 1;
    if (entry.outcome === 'success') {
      accumulator.successes += 1;
    } else {
      accumulator.failures += 1;
    }
    return accumulator;
  }, { total: 0, successes: 0, failures: 0 });

  return {
    entries: filtered,
    total: filtered.length,
    summary
  };
}

async function getAuditLogById(id) {
  const record = await AuditLog.findById(id);
  if (!record) {
    const err = new Error('Audit log entry not found');
    err.status = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  return record.toJSON ? record.toJSON() : { ...record };
}

module.exports = {
  writeAuditLog,
  safeWriteAuditLog,
  redactAuditValue,
  buildRequestAuditEntry,
  listAuditLogs,
  getAuditLogById,
  shouldCaptureRequestAudit
};