import { pool, one, required } from "../common.js";
export const byEmail = (email) =>
  one(pool, "SELECT * FROM facility.users WHERE email=$1", [email]);
export const byToken = (subject, jti) =>
  one(
    pool,
    `SELECT id,name,email,role FROM facility.users WHERE id=$1 AND is_active AND NOT EXISTS(SELECT 1 FROM facility.revoked_tokens WHERE jti=$2)`,
    [subject, jti],
  );
export const revoke = (jti, expires) =>
  pool.query(
    "INSERT INTO facility.revoked_tokens(jti,expires_at) VALUES($1,to_timestamp($2)) ON CONFLICT DO NOTHING",
    [jti, expires],
  );
export const users = async () =>
  (
    await pool.query(
      "SELECT id,name,email,role,is_active FROM facility.users ORDER BY id",
    )
  ).rows;
export const createUser = ({ name, email, password_hash, role }) =>
  one(
    pool,
    "INSERT INTO facility.users(name,email,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id,name,email,role,is_active",
    [name, email, password_hash, role],
  );
export const updateUser = (id, { role, is_active }) =>
  one(
    pool,
    "UPDATE facility.users SET role=COALESCE($2,role),is_active=COALESCE($3,is_active),updated_at=now() WHERE id=$1 RETURNING id,name,email,role,is_active",
    [id, role, is_active],
  ).then(required);
