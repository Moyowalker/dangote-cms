const { AuditLog } = require('../database');
const crypto = require('crypto');

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

module.exports = {
  writeAuditLog,
  safeWriteAuditLog
};