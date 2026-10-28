import { pool } from "../common.js";
export async function snapshot(q, start, end, weekday) {
  return Promise.all([
    pool.query(
      "SELECT r.* FROM facility.resources r JOIN facility.sports s ON s.id=r.sport_id WHERE r.is_active AND s.is_active AND ($1::bigint IS NULL OR r.sport_id=$1) AND ($2::bigint IS NULL OR r.id=$2)",
      [q.sport_id, q.resource_id],
    ),
    pool.query(
      "SELECT * FROM facility.resource_operating_hours WHERE day_of_week=$1",
      [weekday],
    ),
    pool.query(
      "SELECT * FROM facility.resource_unavailability WHERE start_at<$2 AND end_at>$1",
      [start, end],
    ),
    pool.query(
      "SELECT resource_id,start_at,end_at,participants FROM facility.bookings WHERE start_at<$2 AND end_at>$1 AND (status='CONFIRMED' OR (status='HELD' AND hold_expires_at>now()))",
      [start, end],
    ),
  ]);
}
export const schedule = async (q, start, end) =>
  (
    await pool.query(
      `SELECT * FROM facility.booking_details WHERE start_at<$2 AND end_at>$1 AND ($3::bigint IS NULL OR sport_id=$3) AND ($4::bigint IS NULL OR resource_id=$4) AND (status IN ('CONFIRMED','COMPLETED') OR (status='HELD' AND hold_expires_at>now())) ORDER BY resource_id,start_at`,
      [start, end, q.sport_id, q.resource_id],
    )
  ).rows;
export const resources = async (q) =>
  (
    await pool.query(
      "SELECT * FROM facility.resources WHERE ($1::bigint IS NULL OR sport_id=$1) AND ($2::bigint IS NULL OR id=$2) ORDER BY id",
      [q.sport_id, q.resource_id],
    )
  ).rows;
