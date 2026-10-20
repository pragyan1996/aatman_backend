import { createHash } from 'node:crypto';
export const httpError = (status, message) => Object.assign(new Error(message), { status });
export const hashToken = (token) => createHash('sha256').update(token).digest('hex');
export const normalizePhone = (phone) => {
  if (typeof phone !== 'string' || !/^\+?[1-9]\d{7,14}$/.test(phone)) {
    throw httpError(400, 'Use a phone number with country code, e.g. +919876543210');
  }
  return phone.replace(/^\+/, '');
};
