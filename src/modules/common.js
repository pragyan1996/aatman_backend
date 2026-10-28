import Joi from "joi";
import pool from "../config/db.js";
export { Joi, pool };
export const fail = (status, message, code = "VALIDATION_ERROR") =>
  Object.assign(new Error(message), { status, code });
export const ok = (res, data, status = 200, message = "Success") =>
  res.status(status).json({ success: true, message, data });
export const id = Joi.number()
  .integer()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);
export const text = Joi.string().trim().max(200);
export const phone = Joi.string()
  .trim()
  .replace(/[\s()-]/g, "")
  .custom((v, h) => {
    const p = /^\d{10}$/.test(v) ? "+91" + v : v.startsWith("+") ? v : "+" + v;
    return /^\+[1-9]\d{7,14}$/.test(p) ? p : h.error("any.invalid");
  });
export const validate =
  (schema, location = "body") =>
  (req, res, next) => {
    const { value, error } = schema.validate(req[location], {
      abortEarly: false,
      convert: true,
    });
    if (error)
      return next(
        fail(
          400,
          error.details.map((d) => d.message).join("; "),
          "INVALID_REQUEST",
        ),
      );
    req.input ||= {};
    req.input[location] = value;
    next();
  };
export const transaction = async (fn) => {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const result = await fn(db);
    await db.query("COMMIT");
    return result;
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
};
export async function one(db, sql, values = []) {
  return (await db.query(sql, values)).rows[0];
}
export function required(row) {
  if (!row) throw fail(404, "Record not found", "NOT_FOUND");
  return row;
}
export const params = validate(Joi.object({ id: id.required() }), "params");
