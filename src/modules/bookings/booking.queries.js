import { pool, one } from "../common.js";
import { dayBounds, today } from "../../utils/date-time.js";
export async function list(q) {
  const args = [],
    where = [];
  const add = (value, clause) => {
    args.push(value);
    where.push(clause.replaceAll("?", "$" + args.length));
  };
  if (q.date) {
    const [s, e] = dayBounds(q.date);
    add(s, "start_at>=?");
    add(e, "start_at<?");
  }
  if (q.date_from) add(dayBounds(q.date_from)[0], "start_at>=?");
  if (q.date_to) add(dayBounds(q.date_to)[1], "start_at<?");
  if (q.tab === "TODAY") {
    const [s, e] = dayBounds(today());
    add(s, "start_at>=?");
    add(e, "start_at<?");
  }
  if (q.tab === "UPCOMING")
    where.push(
      "end_at>now() AND (status='CONFIRMED' OR (status='HELD' AND hold_expires_at>now()))",
    );
  if (q.tab === "PAST") where.push("end_at<=now()");
  for (const [key, col] of Object.entries({
    sport_id: "sport_id",
    resource_id: "resource_id",
    source: "booking_source",
    payment_status: "payment_status",
    booking_status: "status",
  }))
    if (q[key]) add(q[key], col + "=?");
  if (q.search)
    add(
      "%" + q.search + "%",
      "(customer_name ILIKE ? OR phone ILIKE ? OR booking_code ILIKE ?)",
    );
  const filter = where.length ? "WHERE " + where.join(" AND ") : "";
  const count = await one(
    pool,
    `SELECT count(*)::int total FROM facility.booking_details ${filter}`,
    args,
  );
  const sort =
    {
      start_at: "start_at",
      created_at: "created_at",
      total_amount: "total_amount",
    }[q.sort] || "start_at";
  const { rows } = await pool.query(
    `SELECT * FROM facility.booking_details ${filter} ORDER BY ${sort} ${q.sort_order === "desc" ? "DESC" : "ASC"},id LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
    [...args, q.limit, (q.page - 1) * q.limit],
  );
  return {
    items: rows,
    pagination: {
      page: q.page,
      limit: q.limit,
      total: count.total,
      pages: Math.ceil(count.total / q.limit),
    },
  };
}
export async function summary(date) {
  const [s, e] = dayBounds(date);
  const row = await one(
    pool,
    `SELECT
 count(*) FILTER(WHERE start_at>=$1 AND start_at<$2 AND status='CONFIRMED')::int total_bookings,
 count(*) FILTER(WHERE start_at>=$1 AND start_at<$2 AND status='CONFIRMED' AND payment_status='PAID')::int paid,
 count(*) FILTER(WHERE start_at>=$1 AND start_at<$2 AND status='CONFIRMED' AND outstanding_amount>0 AND payment_collection_type='DESK')::int collect_at_desk,
 count(*) FILTER(WHERE start_at>=$1 AND start_at<$2 AND outstanding_amount>0 AND payment_collection_type='ONLINE' AND (status='CONFIRMED' OR (status='HELD' AND hold_expires_at>now())))::int payment_pending_online,
 count(*) FILTER(WHERE start_at>now() AND (status='CONFIRMED' OR (status='HELD' AND hold_expires_at>now())))::int upcoming_bookings
 FROM facility.booking_details`,
    [s, e],
  );
  return { date, ...row };
}
