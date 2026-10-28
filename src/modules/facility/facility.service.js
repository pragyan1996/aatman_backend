import { transaction, fail } from "../common.js";
import * as repo from "./facility.repository.js";
import { env } from "../../config/env.js";
export { get, list } from "./facility.repository.js";
export async function create(table, data) {
  return repo.create(table, data);
}
export async function update(table, id, data) {
  return transaction(async (db) => {
    if (table === "resources") {
      await repo.lockResource(db, id);
      if (
        [
          "booking_type",
          "capacity",
          "pricing_model",
          "price_per_hour",
          "sport_id",
        ].some((k) => data[k] !== undefined)
      ) {
        const active = await repo.activeBooking(db, id);
        if (
          active &&
          (data.booking_type !== undefined || data.capacity !== undefined)
        )
          throw fail(
            409,
            "Cannot change capacity or booking type with active reservations",
            "RESOURCE_IN_USE",
          );
      }
    }
    return repo.update(table, id, data, db);
  });
}
export async function setHours(id, hours) {
  return transaction(async (db) => {
    await repo.get("resources", id, db);
    await repo.lockResource(db, id);
    if (await repo.activeBooking(db, id))
      throw fail(
        409,
        "Resolve future reservations before changing hours",
        "RESOURCE_IN_USE",
      );
    for (const h of hours) {
      if (
        [h.opening_time, h.closing_time].some(
          (t) => Number(t.split(":")[1]) % env.slotMinutes !== 0,
        )
      )
        throw fail(422, "Hours must align to slot interval");
      if (!h.is_closed && h.closing_time <= h.opening_time)
        throw fail(422, "Closing time must follow opening time");
      await repo.setHour(db, id, h);
    }
    return hours;
  });
}
export async function block(id, data) {
  return transaction(async (db) => {
    await repo.get("resources", id, db);
    await repo.lockResource(db, id);
    if (new Date(data.end_at) <= new Date(data.start_at))
      throw fail(422, "End must follow start");
    const conflict = await repo.overlap(db, id, data);
    if (conflict)
      throw fail(409, "Maintenance overlaps reservations", "BOOKING_CONFLICT");
    return repo.create(
      "resource_unavailability",
      { resource_id: id, ...data },
      db,
    );
  });
}
export const quickCustomer = repo.quickCustomer;
export async function hours(id) {
  await repo.get("resources", id);
  return repo.hours(id);
}
export async function blocks(id) {
  await repo.get("resources", id);
  return repo.blocks(id);
}
