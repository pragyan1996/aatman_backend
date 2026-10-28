import { DateTime } from "luxon";
import * as repo from "./availability.repository.js";
import { env } from "../../config/env.js";
import { dayBounds } from "../../utils/date-time.js";
import { maxOccupancy } from "../bookings/booking.service.js";
export async function availability(q) {
  const [start, end] = dayBounds(q.date);
  // Four batched reads, independent of resource/slot count.
  const [resources, hours, blocks, bookings] = await repo.snapshot(
    q,
    start,
    end,
    DateTime.fromISO(q.date, { zone: env.timezone }).weekday % 7,
  );
  return {
    date: q.date,
    timezone: env.timezone,
    resources: resources.rows.map((r) => {
      const h = hours.rows.find((h) => h.resource_id === r.id),
        slots = [];
      if (h && !h.is_closed) {
        let cursor = DateTime.fromISO(q.date + "T" + h.opening_time, {
          zone: env.timezone,
        });
        const close = DateTime.fromISO(q.date + "T" + h.closing_time, {
          zone: env.timezone,
        });
        while (cursor.plus({ minutes: q.duration_minutes }) <= close) {
          const a = cursor.toUTC().toISO(),
            b = cursor.plus({ minutes: q.duration_minutes }).toUTC().toISO();
          const occupancy = maxOccupancy(
            bookings.rows.filter((b) => b.resource_id === r.id),
            a,
            b,
          );
          const maintenance = blocks.rows.some(
            (x) =>
              x.resource_id === r.id &&
              new Date(x.start_at) < new Date(b) &&
              new Date(x.end_at) > new Date(a),
          );
          const remaining =
            r.booking_type === "EXCLUSIVE"
              ? occupancy
                ? 0
                : r.capacity
              : r.capacity - occupancy;
          slots.push({
            start_at: a,
            end_at: b,
            remaining_capacity: maintenance ? 0 : remaining,
            available:
              !maintenance &&
              remaining >= q.participants &&
              cursor.toMillis() > Date.now(),
          });
          cursor = cursor.plus({ minutes: env.slotMinutes });
        }
      }
      return { resource: r, slots };
    }),
  };
}
export async function schedule(q) {
  const [start, end] = dayBounds(q.date);
  const [rows, resources] = await Promise.all([
    repo.schedule(q, start, end),
    repo.resources(q),
  ]);
  return {
    date: q.date,
    timezone: env.timezone,
    resources: resources.map((resource) => ({
      resource,
      bookings: rows.filter((b) => b.resource_id === resource.id),
    })),
  };
}
