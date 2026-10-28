import { pool, one, required } from "../common.js";
export const detail = (id, db = pool) =>
  one(db, "SELECT * FROM facility.booking_details WHERE id=$1", [id]).then(
    required,
  );
export const lock = (db, id) =>
  one(db, "SELECT * FROM facility.bookings WHERE id=$1 FOR UPDATE", [id]).then(
    required,
  );
export const lockResource = (db, id) =>
  one(
    db,
    `SELECT r.*,s.is_active AS sport_active FROM facility.resources r JOIN facility.sports s ON s.id=r.sport_id WHERE r.id=$1 FOR UPDATE OF r`,
    [id],
  ).then(required);
export const event = (db, id, type, before, after, actor) =>
  db.query(
    `INSERT INTO facility.booking_events(booking_id,event_type,previous_data,new_data,performed_by) VALUES($1,$2,$3,$4,$5)`,
    [id, type, before, after, actor],
  );
export async function expireResource(db, id) {
  const { rows } = await db.query(
    "UPDATE facility.bookings SET status='EXPIRED',updated_at=now() WHERE resource_id=$1 AND status='HELD' AND hold_expires_at<=clock_timestamp() RETURNING *",
    [id],
  );
  for (const row of rows)
    await event(db, row.id, "EXPIRED", { status: "HELD" }, row, null);
}
export const overlaps = async (db, id, start, end, exclude) =>
  (
    await db.query(
      `SELECT start_at,end_at,participants FROM facility.bookings WHERE resource_id=$1 AND start_at<$3 AND end_at>$2 AND id<>$4 AND (status='CONFIRMED' OR (status='HELD' AND hold_expires_at>clock_timestamp()))`,
      [id, start, end, exclude || 0],
    )
  ).rows;
export const hours = (db, id, day) =>
  one(
    db,
    "SELECT * FROM facility.resource_operating_hours WHERE resource_id=$1 AND day_of_week=$2",
    [id, day],
  );
export const blocked = (db, id, start, end) =>
  one(
    db,
    "SELECT id FROM facility.resource_unavailability WHERE resource_id=$1 AND start_at<$3 AND end_at>$2 LIMIT 1",
    [id, start, end],
  );
export const events = async (id) =>
  (
    await pool.query(
      "SELECT * FROM facility.booking_events WHERE booking_id=$1 ORDER BY id",
      [id],
    )
  ).rows;
export const advisoryLock = (db, scope, key) =>
  db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    scope + ":" + key,
  ]);
export const retryRecord = (db, scope, key) =>
  one(db, "SELECT * FROM facility.idempotency_keys WHERE scope=$1 AND key=$2", [
    scope,
    key,
  ]);
export const saveRetry = (db, scope, key, hash, response) =>
  db.query(
    "INSERT INTO facility.idempotency_keys(scope,key,request_hash,response) VALUES($1,$2,$3,$4)",
    [scope, key, hash, response],
  );
export const customer = (db, id) =>
  one(db, "SELECT id FROM facility.customers WHERE id=$1", [id]).then(required);
export const insert = (
  db,
  { code, customer, resource, data, amount, online, held, holdMinutes, actor },
) =>
  one(
    db,
    `INSERT INTO facility.bookings(booking_code,customer_id,resource_id,start_at,end_at,participants,total_amount,booking_source,status,payment_collection_type,hold_expires_at,notes,created_by,exclusive)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CASE WHEN $11 THEN clock_timestamp()+make_interval(mins=>$12) ELSE NULL END,$13,$14,$15) RETURNING *`,
    [
      code,
      customer.id,
      resource.id,
      data.start_at,
      data.end_at,
      data.participants,
      amount,
      data.booking_source,
      held ? "HELD" : "CONFIRMED",
      online ? "ONLINE" : "DESK",
      held,
      holdMinutes,
      data.notes,
      actor,
      resource.booking_type === "EXCLUSIVE",
    ],
  );
export const resourceOf = (db, id) =>
  one(db, "SELECT resource_id FROM facility.bookings WHERE id=$1", [id]).then(
    required,
  );
export const cancel = (db, id, reason) =>
  one(
    db,
    "UPDATE facility.bookings SET status='CANCELLED',cancelled_at=now(),cancellation_reason=$2,updated_at=now() WHERE id=$1 RETURNING *",
    [id, reason],
  );
export const reschedule = (db, id, r, data, amount) =>
  one(
    db,
    `UPDATE facility.bookings SET resource_id=$2,start_at=$3,end_at=$4,total_amount=$5,exclusive=$6,updated_at=now() WHERE id=$1 RETURNING *`,
    [
      id,
      r.id,
      data.start_at,
      data.end_at,
      amount,
      r.booking_type === "EXCLUSIVE",
    ],
  );
export const update = (db, id, notes) =>
  one(
    db,
    "UPDATE facility.bookings SET notes=$2,updated_at=now() WHERE id=$1 RETURNING *",
    [id, notes],
  );

export const pendingOnline = (db, id) =>
  one(
    db,
    "SELECT id FROM facility.payments WHERE booking_id=$1 AND method='ONLINE' AND status='PENDING' LIMIT 1",
    [id],
  );
