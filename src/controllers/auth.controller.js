const service = require('../services/auth.service');
const pool = require('../config/db');
const { normalizePhone, httpError } = require('../utils/auth');
exports.requestOtp = async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  await service.requestOtp(phone);
  res.json({ message: 'OTP sent', expiresIn: 300, resendAfter: 60 });
};
exports.verifyOtp = async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const otp = req.body?.otp;
  if (typeof otp !== 'string' || !/^\d{6}$/.test(otp)) throw httpError(400, 'OTP must be a six-digit string');
  res.json(await service.verifyOtp(phone, otp));
};
exports.me = (req, res) => res.json({ user: req.user });
exports.updateMe = async (req, res) => {
  const name = req.body?.name;
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) {
    throw httpError(400, 'Name must contain 1 to 100 characters');
  }
  await pool.query('UPDATE users SET name = $1 WHERE id = $2', [name.trim(), req.user.id]);
  res.json({ user: { ...req.user, name: name.trim() } });
};
exports.logout = async (req, res) => {
  await pool.query('DELETE FROM sessions WHERE token_hash = $1', [req.tokenHash]);
  res.status(204).end();
};
