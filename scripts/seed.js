import { pathToFileURL } from "node:url";
import bcrypt from "bcrypt";
import { DateTime } from "luxon";
import { pool, transaction, one } from "../src/modules/common.js";
import { env } from "../src/config/env.js";
import { create } from "../src/modules/bookings/booking.service.js";
import { desk } from "../src/modules/payments/payment.service.js";
export async function seed() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase(),
    password = process.env.ADMIN_PASSWORD;
  if (
    !email ||
    !password ||
    password.length < 12 ||
    Buffer.byteLength(password, "utf8") > 72
  )
    throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters)");
  const admin = await transaction(async (db) => {
    const admin = await one(
      db,
      `INSERT INTO facility.users(name,email,password_hash,role) VALUES($1,$2,$3,'ADMIN') ON CONFLICT(email) DO UPDATE SET email=EXCLUDED.email RETURNING id`,
      [
        process.env.ADMIN_NAME || "Facility Admin",
        email,
        await bcrypt.hash(password, 12),
      ],
    );
    for (const name of ["Badminton", "Swimming", "Gym", "Tennis"])
      await db.query(
        "INSERT INTO facility.sports(name) VALUES($1) ON CONFLICT(name) DO NOTHING",
        [name],
      );
    const resources = [
      ["Badminton", "Badminton Court 1", "Wooden", 4, "EXCLUSIVE", 400],
      ["Badminton", "Badminton Court 2", "Wooden", 4, "EXCLUSIVE", 400],
      ["Badminton", "Badminton Court 3", "Rubber", 4, "EXCLUSIVE", 400],
      [
        "Swimming",
        "Swimming Main Pool",
        null,
        Number(process.env.POOL_CAPACITY || 20),
        "SHARED",
        500,
      ],
      [
        "Gym",
        "Gym Floor",
        null,
        Number(process.env.GYM_CAPACITY || 30),
        "SHARED",
        150,
      ],
      ["Tennis", "Tennis Court 1", null, 4, "EXCLUSIVE", 500],
    ];
    for (const [sport, name, surface, capacity, type, price] of resources) {
      const r = await one(
        db,
        `INSERT INTO facility.resources(sport_id,name,surface_type,capacity,booking_type,price_per_hour,pricing_model) SELECT id,$2,$3,$4,$5,$6,$7 FROM facility.sports WHERE name=$1 ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
        [
          sport,
          name,
          surface,
          capacity,
          type,
          price,
          type === "SHARED" ? "PARTICIPANT" : "RESOURCE",
        ],
      );
      await db.query(
        `INSERT INTO facility.resource_operating_hours(resource_id,day_of_week,opening_time,closing_time) SELECT $1,d,'06:00','23:00' FROM generate_series(0,6) d ON CONFLICT DO NOTHING`,
        [r.id],
      );
    }
    return admin;
  });
  if (process.env.SEED_DEMO === "true") {
    const { rows: resources } = await pool.query(
      "SELECT id FROM facility.resources WHERE name LIKE 'Badminton Court %' ORDER BY id",
    );
    for (let i = 0; i < 3; i++) {
      const start = DateTime.now()
        .setZone(env.timezone)
        .plus({ days: 1 })
        .startOf("day")
        .set({ hour: 10 + i });
      const prior = await one(
        pool,
        "SELECT response FROM facility.idempotency_keys WHERE scope=$1 AND key=$2",
        ["booking:" + admin.id, "seed-demo-" + i],
      );
      const b =
        prior?.response ||
        (await create(
          {
            customer: {
              name: "Demo Customer " + (i + 1),
              phone: "+91900000000" + i,
            },
            resource_id: Number(resources[i].id),
            start_at: start.toUTC().toISO(),
            end_at: start.plus({ hours: 1 }).toUTC().toISO(),
            participants: 1,
            booking_source: i === 2 ? "ONLINE" : "DESK",
            payment_option: i === 2 ? "PAY_ONLINE" : "PAY_AT_DESK",
          },
          admin.id,
          "seed-demo-" + i,
        ));
      if (i < 2)
        await desk(
          b.id,
          { amount: i === 0 ? 400 : 100, method: "CASH" },
          admin.id,
          "seed-payment-" + i,
        );
    }
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await seed();
    console.log("Seed complete");
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
