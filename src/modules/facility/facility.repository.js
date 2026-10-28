import { pool, one, required } from "../common.js";
// Table and column identifiers are supplied only by the module's fixed schema maps.
export const get = (table, id, db = pool) =>
  one(db, `SELECT * FROM facility.${table} WHERE id=$1`, [id]).then(required);
export async function create(table, data, db = pool) {
  const keys = Object.keys(data);
  return one(
    db,
    `INSERT INTO facility.${table}(${keys.join(",")}) VALUES(${keys.map((_, i) => "$" + (i + 1)).join(",")}) RETURNING *`,
    Object.values(data),
  );
}
export async function update(table, id, data, db = pool) {
  const keys = Object.keys(data);
  return required(
    await one(
      db,
      `UPDATE facility.${table} SET ${keys.map((k, i) => k + "=$" + (i + 2)).join(",")},updated_at=now() WHERE id=$1 RETURNING *`,
      [id, ...Object.values(data)],
    ),
  );
}
export async function list(table, q) {
  const values = [];
  const where = [];
  if (q.search) {
    values.push("%" + q.search + "%");
    where.push(
      table === "customers"
        ? `(full_name ILIKE $${values.length} OR phone ILIKE $${values.length})`
        : `name ILIKE $${values.length}`,
    );
  }
  if (q.sport_id && table === "resources") {
    values.push(q.sport_id);
    where.push(`sport_id=$${values.length}`);
  }
  if (q.is_active !== undefined && table !== "customers") {
    values.push(q.is_active);
    where.push(`is_active=$${values.length}`);
  }
  const filter = where.length ? "WHERE " + where.join(" AND ") : "";
  const count = await one(
    pool,
    `SELECT count(*)::int AS total FROM facility.${table} ${filter}`,
    values,
  );
  const rows = await pool.query(
    `SELECT * FROM facility.${table} ${filter} ORDER BY id LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, q.limit, (q.page - 1) * q.limit],
  );
  return {
    items: rows.rows,
    pagination: {
      page: q.page,
      limit: q.limit,
      total: count.total,
      pages: Math.ceil(count.total / q.limit),
    },
  };
}
export const lockResource = (db, id) =>
  one(db, "SELECT id FROM facility.resources WHERE id=$1 FOR UPDATE", [id]);
export const activeBooking = (db, id) =>
  one(
    db,
    "SELECT id FROM facility.bookings WHERE resource_id=$1 AND status IN ('HELD','CONFIRMED') AND end_at>now() LIMIT 1",
    [id],
  );
export const setHour = (db, id, h) =>
  db.query(
    `INSERT INTO facility.resource_operating_hours(resource_id,day_of_week,opening_time,closing_time,is_closed) VALUES($1,$2,$3,$4,$5) ON CONFLICT(resource_id,day_of_week) DO UPDATE SET opening_time=$3,closing_time=$4,is_closed=$5`,
    [id, h.day_of_week, h.opening_time, h.closing_time, h.is_closed],
  );
export const overlap = (db, id, data) =>
  one(
    db,
    `SELECT id FROM facility.bookings WHERE resource_id=$1 AND start_at<$3 AND end_at>$2 AND (status='CONFIRMED' OR (status='HELD' AND hold_expires_at>now())) LIMIT 1`,
    [id, data.start_at, data.end_at],
  );
export const quickCustomer = (db, customer) =>
  one(
    db,
    `INSERT INTO facility.customers(full_name,phone,email) VALUES($1,$2,$3) ON CONFLICT(phone) DO UPDATE SET phone=EXCLUDED.phone RETURNING *`,
    [customer.name, customer.phone, customer.email],
  );
export const hours = async (id) =>
  (
    await pool.query(
      "SELECT * FROM facility.resource_operating_hours WHERE resource_id=$1 ORDER BY day_of_week",
      [id],
    )
  ).rows;
export const blocks = async (id) =>
  (
    await pool.query(
      "SELECT * FROM facility.resource_unavailability WHERE resource_id=$1 ORDER BY start_at",
      [id],
    )
  ).rows;
