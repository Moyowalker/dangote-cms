function sendError(res, status, message, code = 'ERROR', details = null) {
  const payload = {
    success: false,
    error: message,
    code
  };

  if (details) {
    payload.details = details;
  }

  return res.status(status).json(payload);
}

module.exports = {
  sendError
};