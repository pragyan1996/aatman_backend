const pool = require('../config/db');
const { hashToken, httpError } = require('../utils/auth');
module.exports = async (req, res, next) => {
  try {
    const match = /^Bearer ([a-f0-9]{64})$/.exec(req.get('Authorization') || '');
    if (!match) throw httpError(401, 'A valid Bearer token is required');
    const tokenHash = hashToken(match[1]);
    const { rows: [user] } = await pool.query(`SELECT u.id, u.phone, u.name, u.created_at, u.last_login_at
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > clock_timestamp()`, [tokenHash]);
    if (!user) throw httpError(401, 'Session expired or invalid');
    req.user = user;
    req.tokenHash = tokenHash;
    next();
  } catch (error) { next(error); }
};
