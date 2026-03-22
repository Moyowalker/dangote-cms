const METRIC_WINDOW_MS = 15 * 60 * 1000;
const MAX_SAMPLES_PER_OPERATION = 200;

const OPERATION_CONFIG = {
  'ticket.validate': {
    slowThresholdMs: 1500,
    stallThresholdMs: 5000,
    pathMatchers: [
      /^\/api\/tickets\/validate(?:\/|$)/,
      /^\/api\/tickets\/validate-token(?:\/|$)/
    ]
  },
  'ticket.consume': {
    slowThresholdMs: 2000,
    stallThresholdMs: 6000,
    pathMatchers: [/^\/api\/tickets\/consume(?:\/|$)/]
  }
};

const completedByOperation = new Map();
const activeRequests = new Map();

function normalizePath(pathname) {
  return String(pathname || '').split('?')[0];
}

function identifyOperation(method, originalUrl) {
  const normalizedPath = normalizePath(originalUrl);
  const normalizedMethod = String(method || '').toUpperCase();

  if (!['GET', 'POST'].includes(normalizedMethod)) {
    return null;
  }

  for (const [operationName, config] of Object.entries(OPERATION_CONFIG)) {
    if (config.pathMatchers.some((matcher) => matcher.test(normalizedPath))) {
      return operationName;
    }
  }

  return null;
}

function pruneCompletedSamples(operationName, now) {
  const samples = completedByOperation.get(operationName) || [];
  const filtered = samples.filter((sample) => now - sample.finishedAt <= METRIC_WINDOW_MS);

  if (filtered.length > MAX_SAMPLES_PER_OPERATION) {
    filtered.splice(0, filtered.length - MAX_SAMPLES_PER_OPERATION);
  }

  completedByOperation.set(operationName, filtered);
  return filtered;
}

function beginTrackedRequest({ requestId, method, originalUrl, startedAt = Date.now() }) {
  const operationName = identifyOperation(method, originalUrl);
  if (!operationName) {
    return null;
  }

  const tracker = {
    requestId: String(requestId || `${operationName}-${startedAt}`),
    operationName,
    startedAt
  };

  activeRequests.set(tracker.requestId, tracker);
  return tracker;
}

function finishTrackedRequest(tracker, { finishedAt = Date.now(), statusCode = 200 } = {}) {
  if (!tracker || !tracker.requestId || !activeRequests.has(tracker.requestId)) {
    return;
  }

  activeRequests.delete(tracker.requestId);

  const config = OPERATION_CONFIG[tracker.operationName];
  if (!config) {
    return;
  }

  const durationMs = Math.max(0, finishedAt - tracker.startedAt);
  const samples = pruneCompletedSamples(tracker.operationName, finishedAt);
  samples.push({
    durationMs,
    finishedAt,
    statusCode
  });

  if (samples.length > MAX_SAMPLES_PER_OPERATION) {
    samples.splice(0, samples.length - MAX_SAMPLES_PER_OPERATION);
  }
}

function percentile(values, ratio) {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function healthStatusForMetrics({ stalledRequests, p95Ms, slowRequests, totalRequests }, config) {
  if (stalledRequests > 0 || p95Ms >= config.stallThresholdMs) {
    return 'critical';
  }

  if (p95Ms >= config.slowThresholdMs || (slowRequests > 0 && totalRequests > 0)) {
    return 'warning';
  }

  return 'normal';
}

function getRequestMetricsSnapshot(now = Date.now()) {
  const snapshot = {};

  for (const [operationName, config] of Object.entries(OPERATION_CONFIG)) {
    const samples = pruneCompletedSamples(operationName, now);
    const activeForOperation = [...activeRequests.values()].filter((entry) => entry.operationName === operationName);
    const durations = samples.map((sample) => sample.durationMs);
    const totalRequests = samples.length;
    const slowRequests = samples.filter((sample) => sample.durationMs >= config.slowThresholdMs).length;
    const stalledRequests = activeForOperation.filter((entry) => now - entry.startedAt >= config.stallThresholdMs).length;
    const averageMs = totalRequests
      ? Math.round(durations.reduce((sum, value) => sum + value, 0) / totalRequests)
      : 0;
    const p95Ms = totalRequests ? percentile(durations, 0.95) : 0;

    snapshot[operationName] = {
      window_minutes: Math.round(METRIC_WINDOW_MS / 60000),
      total_requests: totalRequests,
      average_ms: averageMs,
      p95_ms: p95Ms,
      slow_requests: slowRequests,
      slow_threshold_ms: config.slowThresholdMs,
      active_requests: activeForOperation.length,
      stalled_requests: stalledRequests,
      stall_threshold_ms: config.stallThresholdMs,
      health_status: healthStatusForMetrics({ stalledRequests, p95Ms, slowRequests, totalRequests }, config)
    };
  }

  return snapshot;
}

function resetRequestMetrics() {
  completedByOperation.clear();
  activeRequests.clear();
}

module.exports = {
  beginTrackedRequest,
  finishTrackedRequest,
  getRequestMetricsSnapshot,
  resetRequestMetrics
};