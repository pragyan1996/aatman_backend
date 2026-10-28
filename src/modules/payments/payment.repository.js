import { pool, one } from "../common.js";
export const list = async (id) =>
  (
    await pool.query(
      "SELECT * FROM facility.payments WHERE booking_id=$1 ORDER BY id",
      [id],
    )
  ).rows;
export const desk = (db, id, data) =>
  one(
    db,
    `INSERT INTO facility.payments(booking_id,amount,method,status,transaction_reference,paid_at) VALUES($1,$2,$3,'SUCCESS',$4,now()) RETURNING *`,
    [id, data.amount, data.method, data.transaction_reference],
  );
export const pending = (db, id) =>
  one(
    db,
    "SELECT * FROM facility.payments WHERE booking_id=$1 AND status='PENDING'",
    [id],
  );
export const online = (db, id, amount, provider, order) =>
  one(
    db,
    `INSERT INTO facility.payments(booking_id,amount,method,status,provider,provider_order_id) VALUES($1,$2,'ONLINE','PENDING',$3,$4) RETURNING *`,
    [id, amount, provider, order],
  );
export const successful = (db, payment, id) =>
  one(
    db,
    "SELECT * FROM facility.payments WHERE id=$1 AND booking_id=$2 AND status='SUCCESS' FOR UPDATE",
    [payment, id],
  );
export const refund = (db, p, reference, provider = p.provider) =>
  one(
    db,
    `INSERT INTO facility.payments(booking_id,amount,method,status,provider,refund_of,transaction_reference,paid_at) VALUES($1,$2,$3,'REFUNDED',$4,$5,$6,now()) RETURNING *`,
    [p.booking_id, p.amount, p.method, provider, p.id, reference],
  );
export const advisoryLock = (db, id) =>
  db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    "webhook:" + id,
  ]);
export const delivered = (db, id) =>
  one(db, "SELECT id FROM facility.webhook_events WHERE id=$1", [id]);
export const lookupEvent = (db, e, provider) =>
  one(
    db,
    e.type === "refund.processed"
      ? "SELECT * FROM facility.payments WHERE transaction_reference=$1 AND provider=$2"
      : "SELECT * FROM facility.payments WHERE provider_order_id=$1 AND provider=$2",
    [e.type === "refund.processed" ? e.paymentId : e.orderId, provider],
  );
export const lock = (db, id) =>
  one(db, "SELECT * FROM facility.payments WHERE id=$1 FOR UPDATE", [id]);
export const refunded = (db, id) =>
  one(db, "SELECT id FROM facility.payments WHERE refund_of=$1", [id]);
export const capture = (db, id, reference) =>
  db.query(
    "UPDATE facility.payments SET status='SUCCESS',transaction_reference=$2,paid_at=now(),updated_at=now() WHERE id=$1",
    [id, reference],
  );
export const confirmBooking = (db, id) =>
  db.query(
    "UPDATE facility.bookings SET status='CONFIRMED',hold_expires_at=NULL,updated_at=now() WHERE id=$1",
    [id],
  );
export const failed = (db, id) =>
  db.query(
    "UPDATE facility.payments SET status='FAILED',updated_at=now() WHERE id=$1",
    [id],
  );
export const markDelivered = (db, id) =>
  db.query("INSERT INTO facility.webhook_events(id) VALUES($1)", [id]);
