import { randomBytes, createHash } from "node:crypto";
import Decimal from "decimal.js";
import { env } from "../../config/env.js";
import { interval } from "../../utils/date-time.js";
import { transaction, fail } from "../common.js";
import { quickCustomer } from "../facility/facility.service.js";
import * as repo from "./booking.repository.js";
export { detail } from "./booking.repository.js";
export function maxOccupancy(rows, start, end) {
  const a = +new Date(start),
    b = +new Date(end),
    events = [];
  for (const row of rows) {
    const s = Math.max(a, +new Date(row.start_at)),
      e = Math.min(b, +new Date(row.end_at));
    if (s < e) {
      events.push(
        [s, Number(row.participants)],
        [e, -Number(row.participants)],
      );
    }
  }
  events.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  let used = 0,
    max = 0;
  for (const [, delta] of events) {
    used += delta;
    max = Math.max(max, used);
  }
  return max;
}
export async function check(db, r, data, exclude, { future = true } = {}) {
  const { s, e, minutes } = interval(data.start_at, data.end_at, { future });
  if (!r.is_active || !r.sport_active)
    throw fail(422, "Resource is inactive", "RESOURCE_INACTIVE");
  if (data.participants > r.capacity)
    throw fail(409, "Resource capacity exceeded", "BOOKING_CONFLICT");
  const hours = await repo.hours(db, r.id, s.weekday % 7);
  const time = (d) => d.toFormat("HH:mm:ss");
  if (
    !hours ||
    hours.is_closed ||
    time(s) < hours.opening_time ||
    time(e) > hours.closing_time ||
    e.toISODate() !== s.toISODate()
  )
    throw fail(422, "Outside operating hours", "OUTSIDE_OPERATING_HOURS");
  if (await repo.blocked(db, r.id, data.start_at, data.end_at))
    throw fail(409, "Resource unavailable for maintenance", "BOOKING_CONFLICT");
  const rows = await repo.overlaps(
    db,
    r.id,
    data.start_at,
    data.end_at,
    exclude,
  );
  if (
    (r.booking_type === "EXCLUSIVE" && rows.length) ||
    (r.booking_type === "SHARED" &&
      maxOccupancy(rows, data.start_at, data.end_at) + data.participants >
        r.capacity)
  )
    throw fail(409, "Selected slot is unavailable", "BOOKING_CONFLICT");
  const amount = new Decimal(r.price_per_hour)
    .times(minutes)
    .div(60)
    .times(r.pricing_model === "PARTICIPANT" ? data.participants : 1)
    .toDecimalPlaces(2)
    .toFixed(2);
  if (new Decimal(amount).gt("9999999999.99"))
    throw fail(422, "Booking amount exceeds the supported maximum");
  return amount;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}
export async function idempotent(db, scope, key, input, fn) {
  if (key === undefined) return fn();
  if (typeof key !== "string" || key.length > 128 || !key.trim())
    throw fail(400, "Invalid Idempotency-Key");
  const hash = createHash("sha256")
    .update(JSON.stringify(canonical(input)))
    .digest("hex");
  await repo.advisoryLock(db, scope, key);
  const prior = await repo.retryRecord(db, scope, key);
  if (prior) {
    if (prior.request_hash !== hash)
      throw fail(
        409,
        "Idempotency key reused with different input",
        "IDEMPOTENCY_CONFLICT",
      );
    return prior.response;
  }
  const response = await fn();
  await repo.saveRetry(db, scope, key, hash, response);
  return response;
}
export async function create(data, actor, key) {
  return transaction((db) =>
    idempotent(db, "booking:" + actor, key, data, async () => {
      const r = await repo.lockResource(db, data.resource_id);
      await repo.expireResource(db, r.id);
      const amount = await check(db, r, data);
      const customer = data.customer
        ? await quickCustomer(db, data.customer)
        : await repo.customer(db, data.customer_id);
      const online = data.payment_option === "PAY_ONLINE";
      const row = await repo.insert(db, {
        code: "AQB-" + randomBytes(8).toString("hex").toUpperCase(),
        customer,
        resource: r,
        data,
        amount,
        online,
        held: online && new Decimal(amount).gt(0),
        holdMinutes: env.holdMinutes,
        actor,
      });
      await repo.event(db, row.id, "CREATED", null, row, actor);
      return repo.detail(row.id, db);
    }),
  );
}
// All writers acquire resource locks before booking locks. Sorted resource IDs avoid reschedule deadlocks.
export async function locked(db, id, target) {
  const peek = await repo.resourceOf(db, id);
  for (const rid of [
    ...new Set([String(peek.resource_id), String(target || peek.resource_id)]),
  ].sort((a, b) => Number(a) - Number(b)))
    await repo.lockResource(db, rid);
  const row = await repo.lock(db, id);
  if (String(row.resource_id) !== String(peek.resource_id))
    throw fail(409, "Booking changed; retry request", "BOOKING_CHANGED");
  await repo.expireResource(db, row.resource_id);
  return repo.lock(db, id);
}
export async function cancel(id, reason, actor) {
  return transaction(async (db) => {
    const b = await locked(db, id);
    if (b.status === "CANCELLED") return repo.detail(id, db);
    if (
      !["HELD", "CONFIRMED"].includes(b.status) ||
      new Date(b.end_at) <= new Date()
    )
      throw fail(422, "Booking cannot be cancelled in its current state");
    const after = await repo.cancel(db, id, reason);
    await repo.event(db, id, "CANCELLED", b, after, actor);
    return repo.detail(id, db);
  });
}
export async function reschedule(id, data, actor) {
  return transaction(async (db) => {
    const b = await locked(db, id, data.resource_id);
    if (
      !["HELD", "CONFIRMED"].includes(b.status) ||
      new Date(b.start_at) <= new Date()
    )
      throw fail(422, "Booking cannot be rescheduled in its current state");
    if (await repo.pendingOnline(db, id))
      throw fail(
        409,
        "Resolve the pending online payment before rescheduling",
        "PAYMENT_IN_PROGRESS",
      );
    const r = await repo.lockResource(db, data.resource_id || b.resource_id);
    await repo.expireResource(db, r.id);
    const amount = await check(
      db,
      r,
      { ...data, participants: b.participants },
      id,
    );
    const details = await repo.detail(id, db);
    if (new Decimal(details.paid_amount).gt(amount))
      throw fail(
        422,
        "Refund excess payment before lowering the booking price",
      );
    const after = await repo.reschedule(db, id, r, data, amount);
    await repo.event(db, id, "RESCHEDULED", b, after, actor);
    return repo.detail(id, db);
  });
}
export async function update(id, data, actor) {
  return transaction(async (db) => {
    const b = await locked(db, id);
    if (!["CONFIRMED", "HELD"].includes(b.status))
      throw fail(422, "Booking is not editable");
    const after = await repo.update(db, id, data.notes);
    await repo.event(db, id, "UPDATED", b, after, actor);
    return repo.detail(id, db);
  });
}
export async function events(id) {
  await repo.detail(id);
  return repo.events(id);
}
