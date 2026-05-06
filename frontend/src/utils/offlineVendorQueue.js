const VALIDATION_CACHE_KEY = 'dangote-vendor-validation-cache';
const OFFLINE_QUEUE_KEY = 'dangote-vendor-offline-queue';
const OFFLINE_ACTIVITY_KEY = 'dangote-vendor-offline-activity';
const OFFLINE_DEVICE_PROFILE_KEY = 'dangote-vendor-device-profile';
const VALIDATION_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const OFFLINE_ACTIVITY_LIMIT = 25;

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

function readJson(key, fallback) {
  if (!canUseStorage()) {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  if (!canUseStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage failures in offline assistive flows
  }
}

function generateIdentifier(prefix) {
  const base = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  return prefix ? `${prefix}-${base}` : base;
}

function buildValidationCacheKey({ badgeNumber, mealType, collectorBadgeNumber = '' }) {
  return `${String(badgeNumber || '').trim().toUpperCase()}::${String(mealType || '').trim().toLowerCase()}::${String(collectorBadgeNumber || '').trim().toUpperCase()}`;
}

export function storeVendorValidationSnapshot({ badgeNumber, mealType, collectorBadgeNumber = '', data }) {
  const cache = readJson(VALIDATION_CACHE_KEY, {});
  const cacheKey = buildValidationCacheKey({ badgeNumber, mealType, collectorBadgeNumber });

  cache[cacheKey] = {
    cachedAt: Date.now(),
    date: data?.date || new Date().toISOString().split('T')[0],
    collectorBadgeNumber: String(collectorBadgeNumber || '').trim().toUpperCase() || null,
    data
  };

  writeJson(VALIDATION_CACHE_KEY, cache);
}

export function getVendorValidationSnapshot({ badgeNumber, mealType, collectorBadgeNumber = '', date = new Date().toISOString().split('T')[0] }) {
  const cache = readJson(VALIDATION_CACHE_KEY, {});
  const cacheKey = buildValidationCacheKey({ badgeNumber, mealType, collectorBadgeNumber });
  const snapshot = cache[cacheKey];

  if (!snapshot) {
    return null;
  }

  const age = Date.now() - Number(snapshot.cachedAt || 0);
  if (age > VALIDATION_CACHE_TTL_MS) {
    return null;
  }

  if (snapshot.date !== date) {
    return null;
  }

  return snapshot;
}

export function readOfflineRedemptionQueue() {
  return readJson(OFFLINE_QUEUE_KEY, []);
}

export function writeOfflineRedemptionQueue(queue) {
  writeJson(OFFLINE_QUEUE_KEY, queue);
}

export function hasPendingOfflineRedemption({ badgeNumber, mealType, date = new Date().toISOString().split('T')[0] }) {
  const queue = readOfflineRedemptionQueue();
  return queue.some((item) => (
    item.badgeNumber === badgeNumber
    && item.mealType === mealType
    && item.date === date
  ));
}

export function enqueueOfflineRedemption({ badgeNumber, mealType, employee, canteenLocation, collectorBadgeNumber = null, delegationApprovalId = null, delegation = null, date = new Date().toISOString().split('T')[0] }) {
  const queue = readOfflineRedemptionQueue();
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    badgeNumber,
    mealType,
    employee,
    canteenLocation,
    collectorBadgeNumber,
    delegationApprovalId,
    delegation,
    date,
    queuedAt: new Date().toISOString(),
    attemptCount: 0,
    lastError: null
  };

  queue.unshift(entry);
  writeOfflineRedemptionQueue(queue);
  return entry;
}

export function removeOfflineRedemptionEntry(entryId) {
  const nextQueue = readOfflineRedemptionQueue().filter((item) => item.id !== entryId);
  writeOfflineRedemptionQueue(nextQueue);
  return nextQueue;
}

export function updateOfflineRedemptionEntry(entryId, updates) {
  const nextQueue = readOfflineRedemptionQueue().map((item) => (
    item.id === entryId
      ? { ...item, ...updates }
      : item
  ));

  writeOfflineRedemptionQueue(nextQueue);
  return nextQueue;
}

export function getOfflineDeviceProfile() {
  const existingProfile = readJson(OFFLINE_DEVICE_PROFILE_KEY, null);
  if (existingProfile?.id) {
    return existingProfile;
  }

  const nextProfile = {
    id: generateIdentifier('device'),
    label: 'Dangote Vendor Device',
    registered_at: new Date().toISOString()
  };

  writeJson(OFFLINE_DEVICE_PROFILE_KEY, nextProfile);
  return nextProfile;
}

export function readOfflineActivityHistory() {
  const history = readJson(OFFLINE_ACTIVITY_KEY, []);
  return Array.isArray(history) ? history : [];
}

export function recordOfflineActivityBatch(batch) {
  const history = readOfflineActivityHistory();
  const nextHistory = [batch, ...history].slice(0, OFFLINE_ACTIVITY_LIMIT);
  writeJson(OFFLINE_ACTIVITY_KEY, nextHistory);
  return nextHistory;
}
