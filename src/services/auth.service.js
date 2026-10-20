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
	try {
		const db = await pool.connect();

		let role_data = await db.query(
			`select * from roles where name = 'super_admin';`
		);
		console.log('Role data:', role_data);
		if (role_data.rows.length == 0) throw httpError(500, 'Super admin role not found in the database');

		const admin_data = await db.query(`
			insert into admin_users (name, email, phone, password_hash)
			values ($1, $2, $3, $4)
			returning *;
		`, [name, email, phone, password]
		);

		await db.query(`
			insert into user_roles (user_id, role_id)
			values ($1, $2);
		`, [admin_data.rows[0].id, role_data.rows[0].id]
		);
		db.release();
		return admin_data.rows[0];
	} catch (error) {
		console.log(error);
		throw new Error(error);
	}
}
