import { hashPassword, verifyPassword } from '../utils/password.js';
import { randomBytes } from 'node:crypto';
import pool from '../config/db.js';
import provider from './otp.service.js';
import { httpError, hashToken } from '../utils/auth.js';

export const requestOtp = async (phone) => {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query(`INSERT INTO otp_challenges (phone, sent_at, expires_at)
      VALUES ($1, '2000-01-01', '2000-01-01') ON CONFLICT (phone) DO NOTHING`, [phone]);
    const { rows: [challenge] } = await db.query(`SELECT *, sent_at > clock_timestamp() - INTERVAL '60 seconds' AS cooling
      FROM otp_challenges WHERE phone = $1 FOR UPDATE`, [phone]);
    if (challenge.cooling) throw httpError(429, 'Wait 60 seconds before requesting another OTP');
    // Invalidate the previous challenge even if delivery subsequently fails.
    await db.query(`UPDATE otp_challenges SET sent_at = clock_timestamp(),
      expires_at = clock_timestamp() + INTERVAL '5 minutes', attempts = 0, consumed = TRUE WHERE phone = $1`, [phone]);
    try {
      await provider.sendOtp(phone);
    } catch (error) {
      await db.query('COMMIT');
      throw error;
    }
    await db.query('UPDATE otp_challenges SET consumed = FALSE WHERE phone = $1', [phone]);
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally { db.release(); }
};

export const verifyOtp = async (phone, otp) => {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const { rows: [challenge] } = await db.query(`SELECT *, expires_at > clock_timestamp() AS valid
      FROM otp_challenges WHERE phone = $1 FOR UPDATE`, [phone]);
    if (!challenge || challenge.consumed || !challenge.valid || challenge.attempts >= 5) {
      throw httpError(400, 'OTP expired or unavailable; request a new OTP');
    }
    await db.query('UPDATE otp_challenges SET attempts = attempts + 1 WHERE phone = $1', [phone]);
    let verified;
    try { verified = await provider.verifyOtp(phone, otp); }
    catch (error) { await db.query('COMMIT'); throw error; }
    if (!verified) {
      await db.query('COMMIT');
      throw httpError(400, 'Invalid or expired OTP');
    }
    await db.query('UPDATE otp_challenges SET consumed = TRUE WHERE phone = $1', [phone]);
    await db.query(`INSERT INTO users (phone, last_login_at) VALUES ($1, clock_timestamp())
      ON CONFLICT (phone) DO UPDATE SET last_login_at = clock_timestamp()`, [phone]);
    const { rows: [user] } = await db.query('SELECT id, phone, name, created_at, last_login_at FROM users WHERE phone = $1', [phone]);
    const token = randomBytes(32).toString('hex');
    await db.query(`INSERT INTO sessions (token_hash, user_id, expires_at)
      VALUES ($1, $2, clock_timestamp() + INTERVAL '7 days')`, [hashToken(token), user.id]);
    await db.query('COMMIT');
    return { token, tokenType: 'Bearer', expiresIn: 604800, user };
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally { db.release(); }
};

export const registerUser = async (name, email, phone, password) => {
  const passwordHash = await hashPassword(password);
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const { rows: [role] } = await db.query('SELECT id FROM roles WHERE name = $1', ['admin']);
    if (!role) throw httpError(500, 'Admin role not configured');
    const { rows: [admin] } = await db.query(
      `INSERT INTO admin_users (name, email, phone, password_hash)
       VALUES ($1, $2, $3, $4) RETURNING id, name, email, phone, status, created_at`,
      [name, email.trim().toLowerCase(), phone, passwordHash]);
    await db.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [admin.id, role.id]);
    await db.query('COMMIT');
    return admin;
  } catch (error) {
    await db.query('ROLLBACK');
    if (error.code === '23505') throw httpError(409, 'Email or phone is already registered');
    throw error;
  } finally { db.release(); }
};

export const login = async ({ email, password }) => {
  const db = await pool.connect();
  let transaction = false;
  try {
    await db.query('BEGIN');
    transaction = true;
    const { rows: [admin] } = await db.query(
      `SELECT *, locked_until > clock_timestamp() AS locked
       FROM admin_users WHERE email = $1 FOR UPDATE`, [email.trim().toLowerCase()]);
    const valid = await verifyPassword(password, admin?.password_hash);
    if (!admin || admin.status !== 'active' || admin.locked || !valid) {
      if (admin && admin.status === 'active' && !admin.locked && !valid) {
        await db.query(`UPDATE admin_users SET
          failed_login_attempts = CASE WHEN locked_until IS NOT NULL THEN 1 ELSE failed_login_attempts + 1 END,
          locked_until = CASE WHEN (CASE WHEN locked_until IS NOT NULL THEN 1 ELSE failed_login_attempts + 1 END) >= 5
            THEN clock_timestamp() + INTERVAL '15 minutes' ELSE NULL END WHERE id = $1`, [admin.id]);
      }
      await db.query('COMMIT');
      transaction = false;
      throw httpError(401, 'Invalid email or password');
    }
    const token = randomBytes(32).toString('hex');
    await db.query(`INSERT INTO admin_sessions (token_hash, admin_id, expires_at)
      VALUES ($1, $2, clock_timestamp() + INTERVAL '8 hours')`, [hashToken(token), admin.id]);
    const { rows: [user] } = await db.query(`UPDATE admin_users SET failed_login_attempts = 0,
      locked_until = NULL, last_login_at = clock_timestamp() WHERE id = $1
      RETURNING id, name, email, phone, status, last_login_at`, [admin.id]);
    await db.query('COMMIT');
    transaction = false;
    return { token, tokenType: 'Bearer', expiresIn: 28800, user };
  } catch (error) {
    if (transaction) await db.query('ROLLBACK');
    throw error;
  } finally { db.release(); }
};
