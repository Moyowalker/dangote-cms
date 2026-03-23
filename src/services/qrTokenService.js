const crypto = require('crypto');
const { QRTokenMetadata } = require('../database');

const DEFAULT_TTL_SECONDS = 120;

function makeError(message, status = 400, code = 'VALIDATION_ERROR') {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function getSecret() {
  return process.env.QR_TOKEN_SECRET || process.env.SESSION_SECRET || 'dangote-cms-qr-dev-secret';
}

function signPayload(payloadBase64) {
  return crypto
    .createHmac('sha256', getSecret())
    .update(payloadBase64)
    .digest('base64url');
}

function timingSafeEqualString(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodePayload(payloadBase64) {
  try {
    const json = Buffer.from(payloadBase64, 'base64url').toString('utf8');
    return JSON.parse(json);
  } catch (_err) {
    throw makeError('Invalid QR token payload', 400, 'INVALID_QR_TOKEN');
  }
}

async function issueSignedQrToken(employeeId, ttlSeconds = DEFAULT_TTL_SECONDS) {
  const issuedAtUnix = Math.floor(Date.now() / 1000);
  const expUnix = issuedAtUnix + Number(ttlSeconds || DEFAULT_TTL_SECONDS);
  const tokenJti = crypto.randomUUID();

  const payload = {
    employee_id: String(employeeId),
    jti: tokenJti,
    iat: issuedAtUnix,
    exp: expUnix
  };

  const payloadBase64 = encodePayload(payload);
  const signature = signPayload(payloadBase64);

  await QRTokenMetadata.create({
    token_jti: tokenJti,
    employee_id: employeeId,
    issued_at: new Date(issuedAtUnix * 1000),
    expires_at: new Date(expUnix * 1000),
    consumed_at: null,
    revoked: false
  });

  return {
    token: `${payloadBase64}.${signature}`,
    expires_at: new Date(expUnix * 1000).toISOString(),
    ttl_seconds: Number(ttlSeconds || DEFAULT_TTL_SECONDS)
  };
}

async function verifySignedQrToken(token) {
  if (typeof token !== 'string' || !token.trim()) {
    throw makeError('token is required', 400, 'VALIDATION_ERROR');
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    throw makeError('Invalid QR token format', 400, 'INVALID_QR_TOKEN');
  }

  const [payloadBase64, providedSignature] = parts;
  const expectedSignature = signPayload(payloadBase64);
  if (!timingSafeEqualString(providedSignature, expectedSignature)) {
    throw makeError('Invalid QR token signature', 401, 'INVALID_QR_TOKEN');
  }

  const payload = decodePayload(payloadBase64);
  if (!payload || !payload.jti || !payload.employee_id || !payload.exp) {
    throw makeError('Invalid QR token claims', 400, 'INVALID_QR_TOKEN');
  }

  const nowUnix = Math.floor(Date.now() / 1000);
  if (Number(payload.exp) <= nowUnix) {
    throw makeError('QR token has expired', 401, 'EXPIRED_QR_TOKEN');
  }

  const metadata = await QRTokenMetadata.findOne({ token_jti: String(payload.jti) });
  if (!metadata || metadata.revoked) {
    throw makeError('QR token is not active', 401, 'INVALID_QR_TOKEN');
  }

  if (metadata.consumed_at) {
    throw makeError('QR token has already been redeemed', 409, 'CONSUMED_QR_TOKEN');
  }

  if (new Date(metadata.expires_at).getTime() <= Date.now()) {
    throw makeError('QR token has expired', 401, 'EXPIRED_QR_TOKEN');
  }

  await QRTokenMetadata.findOneAndUpdate(
    { token_jti: String(payload.jti) },
    { $set: { last_used_at: new Date() } },
    { new: true }
  );

  return {
    employee_id: String(payload.employee_id),
    jti: String(payload.jti)
  };
}

async function markQrTokenConsumed(tokenJti) {
  const now = new Date();
  const metadata = await QRTokenMetadata.findOneAndUpdate(
    {
      token_jti: String(tokenJti),
      revoked: false,
      consumed_at: null,
      expires_at: { $gt: now }
    },
    { $set: { consumed_at: now, last_used_at: now } },
    { new: true }
  );

  if (!metadata) {
    throw makeError('QR token is no longer redeemable', 409, 'CONSUMED_QR_TOKEN');
  }

  return metadata;
}

async function resetQrTokenConsumption(tokenJti) {
  await QRTokenMetadata.findOneAndUpdate(
    { token_jti: String(tokenJti) },
    { $set: { consumed_at: null } },
    { new: true }
  );
}

module.exports = {
  issueSignedQrToken,
  verifySignedQrToken,
  markQrTokenConsumed,
  resetQrTokenConsumption,
  DEFAULT_TTL_SECONDS
};
