import { pool, transaction } from "../modules/common.js";
import { expireResource } from "../modules/bookings/booking.repository.js";
export async function expireHolds() {
  const { rows } = await pool.query(
    "SELECT DISTINCT resource_id FROM facility.bookings WHERE status='HELD' AND hold_expires_at<=now() ORDER BY resource_id",
  );
  for (const r of rows)
    await transaction(async (db) => {
      await db.query(
        "SELECT id FROM facility.resources WHERE id=$1 FOR UPDATE",
        [r.resource_id],
      );
      await expireResource(db, r.resource_id);
    });
}
