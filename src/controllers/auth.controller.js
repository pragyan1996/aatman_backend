import * as service from '../services/auth.service.js';
import pool from '../config/db.js';
import { normalizePhone, httpError } from '../utils/auth.js';
export const requestOtp = async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  await service.requestOtp(phone);
  res.json({ message: 'OTP sent', expiresIn: 300, resendAfter: 60 });
};
export const verifyOtp = async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const otp = req.body?.otp;
  if (typeof otp !== 'string' || !/^\d{6}$/.test(otp)) throw httpError(400, 'OTP must be a six-digit string');
  res.json(await service.verifyOtp(phone, otp));
};
export const me = (req, res) => res.json({ user: req.user });
export const updateMe = async (req, res) => {
  const name = req.body?.name;
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) {
    throw httpError(400, 'Name must contain 1 to 100 characters');
  }
  await pool.query('UPDATE users SET name = $1 WHERE id = $2', [name.trim(), req.user.id]);
  res.json({ user: { ...req.user, name: name.trim() } });
};
export const logout = async (req, res) => {
  await pool.query('DELETE FROM sessions WHERE token_hash = $1', [req.tokenHash]);
  res.status(204).end();
};

export const register = async (req, res) => {
  const payload = req.validated.body;
  const { name, email, phone, password } = payload;
  let data = await service.registerUser(name, email, phone, password);
  res.status(201).json({ message: 'User registered successfully', user: data });
};
