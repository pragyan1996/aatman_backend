import { DateTime } from "luxon";
import { env } from "../config/env.js";
import { fail } from "../modules/common.js";
export const local = (instant) =>
  DateTime.fromJSDate(new Date(instant), { zone: env.timezone });
export function dayBounds(date) {
  const d = DateTime.fromISO(date, { zone: env.timezone });
  if (!d.isValid || d.toISODate() !== date)
    throw fail(400, "Invalid calendar date");
  return [
    d.startOf("day").toUTC().toISO(),
    d.plus({ days: 1 }).startOf("day").toUTC().toISO(),
  ];
}
export const today = () => DateTime.now().setZone(env.timezone).toISODate();
export function interval(start, end, { future = true } = {}) {
  const a = new Date(start),
    b = new Date(end),
    minutes = (b - a) / 60000;
  if (
    !Number.isFinite(minutes) ||
    minutes <= 0 ||
    minutes > 1440 ||
    minutes % env.slotMinutes !== 0
  )
    throw fail(
      422,
      `Duration must be a multiple of ${env.slotMinutes} minutes, up to 24 hours`,
    );
  if (future && a <= new Date())
    throw fail(422, "Booking must start in the future");
  const s = local(start),
    e = local(end);
  if (s.second !== 0 || s.millisecond !== 0 || s.minute % env.slotMinutes !== 0)
    throw fail(422, "Start must align with the configured slot interval");
  if (s.toISODate() !== e.minus({ milliseconds: 1 }).toISODate())
    throw fail(422, "Booking must fit within one facility day");
  return { s, e, minutes };
}
