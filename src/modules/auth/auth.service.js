import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import { fail } from "../common.js";
import * as repo from "./auth.repository.js";
export async function login({ email, password }) {
  const user = await repo.byEmail(email);
  const valid = await bcrypt.compare(
    password,
    user?.password_hash ||
      "$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW",
  );
  if (!user?.is_active || !valid)
    throw fail(401, "Invalid email or password", "UNAUTHENTICATED");
  const { password_hash, ...safe } = user;
  return {
    token: jwt.sign({}, env.jwtSecret, {
      subject: String(user.id),
      jwtid: randomUUID(),
      expiresIn: "8h",
      issuer: "aatman-api",
      audience: "facility-staff",
      algorithm: "HS256",
    }),
    token_type: "Bearer",
    expires_in: 28800,
    user: safe,
  };
}
export async function authenticate(req, res, next) {
  try {
    const token = /^Bearer (\S+)$/.exec(req.get("Authorization") || "")?.[1];
    let claims;
    try {
      claims = jwt.verify(token, env.jwtSecret, {
        algorithms: ["HS256"],
        issuer: "aatman-api",
        audience: "facility-staff",
      });
    } catch {
      throw fail(401, "Session expired or invalid", "UNAUTHENTICATED");
    }
    const user = await repo.byToken(claims.sub, claims.jti);
    if (!user) throw fail(401, "Session expired or invalid", "UNAUTHENTICATED");
    req.user = user;
    req.claims = claims;
    next();
  } catch (e) {
    next(e);
  }
}
export const admin = (req, res, next) =>
  req.user.role === "ADMIN"
    ? next()
    : next(fail(403, "Administrator role required", "FORBIDDEN"));

export const revoke = repo.revoke;
export const users = repo.users;
export const updateUser = repo.updateUser;
export async function createUser(data) {
  const { password, ...safe } = data;
  return repo.createUser({
    ...safe,
    password_hash: await bcrypt.hash(password, 12),
  });
}
