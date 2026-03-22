function serializeError(err) {
  if (!err) {
    return { message: 'Unknown error' };
  }

  return {
    name: err.name || 'Error',
    message: err.message || 'Unknown error',
    stack: err.stack || null
  };
}

function reportError(err, context = {}) {
  const payload = {
    level: 'error',
    timestamp: new Date().toISOString(),
    context,
    error: serializeError(err)
  };

  // Strategy: emit structured JSON logs that can be shipped to any APM/SIEM.
  console.error(JSON.stringify(payload));
}

module.exports = {
  reportError
};
