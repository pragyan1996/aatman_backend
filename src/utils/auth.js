const { createHash } = require('node:crypto');
exports.httpError = (status, message) => Object.assign(new Error(message), { status });
exports.hashToken = (token) => createHash('sha256').update(token).digest('hex');
exports.normalizePhone = (phone) => {
  if (typeof phone !== 'string' || !/^\+?[1-9]\d{7,14}$/.test(phone)) {
    throw exports.httpError(400, 'Use a phone number with country code, e.g. +919876543210');
  }
  return phone.replace(/^\+/, '');
};
