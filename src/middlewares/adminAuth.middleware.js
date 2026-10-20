import pool from '../config/db.js';
import { hashToken, httpError } from '../utils/auth.js';

export default async (req, res, next) => {
  try {
    const match = /^Bearer ([a-f0-9]{64})$/i.exec(req.get('Authorization') || '');
    if (!match) throw httpError(401, 'A valid Bearer token is required');
    const tokenHash = hashToken(match[1]);
    const { rows: [user] } = await pool.query(`SELECT a.id, a.name, a.email, a.phone, a.status, a.last_login_at
      FROM admin_sessions s JOIN admin_users a ON a.id = s.admin_id
      WHERE s.token_hash = $1 AND s.expires_at > clock_timestamp()
      AND a.status = 'active' AND s.created_at >= a.password_changed_at`, [tokenHash]);
    if (!user) throw httpError(401, 'Session expired or invalid');
    req.user = user;
    req.tokenHash = tokenHash;
    next();
  } catch (error) { next(error); }
};
