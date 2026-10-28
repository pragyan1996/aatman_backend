import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import { createHmac, randomUUID } from "node:crypto";
import { DateTime } from "luxon";
// No database test runs without an explicit dedicated database URL.
const url = process.env.TEST_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  if (!parsed.pathname.endsWith("_test"))
    throw new Error("TEST_DATABASE_URL database name must end in _test");
  process.env.DATABASE_URL = url;
}
process.env.JWT_SECRET = "integration-only-secret-at-least-32-characters";
process.env.MOCK_WEBHOOK_SECRET = "integration-webhook-secret";
process.env.PAYMENT_PROVIDER = "mock";
process.env.FACILITY_TIMEZONE = "Asia/Kolkata";
process.env.SLOT_INTERVAL_MINUTES = "30";
process.env.HOLD_MINUTES = "10";
process.env.LOG_LEVEL = "silent";
process.env.ADMIN_EMAIL = "admin@example.com";
process.env.ADMIN_PASSWORD = "integration-password-12345";
process.env.SEED_DEMO = "false";
const { default: app } = await import("../src/app.js");
const { pool } = await import("../src/modules/common.js");
const { migrate } = await import("../scripts/migrate.js");
const { seed } = await import("../scripts/seed.js");
const { expireHolds } = await import("../src/jobs/expire-booking-holds.js");
const { maxOccupancy } =
  await import("../src/modules/bookings/booking.service.js");
const { dayBounds } = await import("../src/utils/date-time.js");
const date = DateTime.now()
  .setZone("Asia/Kolkata")
  .plus({ days: 10 })
  .toISODate();
const stamp = (hour, minute = 0, day = date) =>
  DateTime.fromISO(day, { zone: "Asia/Kolkata" })
    .set({ hour, minute })
    .toUTC()
    .toISO();
let admin,
  staff,
  resources,
  counter = 0;
const auth = (r, token = admin) => r.set("Authorization", "Bearer " + token);
const payload = (resource, hour = 9, extra = {}) => ({
  customer: {
    name: "Customer " + ++counter,
    phone: "+918888" + String(counter).padStart(6, "0"),
  },
  resource_id: Number(resource.id),
  start_at: stamp(hour),
  end_at: stamp(hour + 1),
  ...extra,
});
const book = async (resource, hour, extra = {}, key) => {
  let r = auth(request(app).post("/api/v1/bookings")).send(
    payload(resource, hour, extra),
  );
  if (key) r = r.set("Idempotency-Key", key);
  return r;
};
async function signed(event, id = randomUUID(), valid = true) {
  const body = JSON.stringify(event);
  return request(app)
    .post("/api/v1/webhooks/payments")
    .set("Content-Type", "application/json")
    .set("x-mock-event-id", id)
    .set(
      "x-mock-signature",
      valid
        ? createHmac("sha256", process.env.MOCK_WEBHOOK_SECRET)
            .update(body)
            .digest("hex")
        : "0".repeat(64),
    )
    .send(body);
}
const captured = (p) => ({
  event: "payment.captured",
  payload: {
    payment: {
      entity: {
        id: "mock_pay_" + randomUUID(),
        order_id: p.provider_order_id,
        amount: Math.round(Number(p.amount) * 100),
        currency: "INR",
      },
    },
  },
});
describe("pure booking rules", () => {
  it("uses maximum concurrent occupancy, with adjacent endpoints released first", () => {
    expect(
      maxOccupancy(
        [
          { start_at: stamp(9), end_at: stamp(10), participants: 3 },
          { start_at: stamp(10), end_at: stamp(11), participants: 3 },
        ],
        stamp(9),
        stamp(11),
      ),
    ).toBe(3);
  });
  it("maps India midnight onto the preceding UTC day", () => {
    expect(dayBounds("2026-10-24")).toEqual([
      "2026-10-23T18:30:00.000Z",
      "2026-10-24T18:30:00.000Z",
    ]);
  });
});
describe.skipIf(!url)("isolated PostgreSQL API", () => {
  beforeAll(async () => {
    // Isolated test database explicitly selected above; never reset a development database.
    await pool.query("DROP SCHEMA IF EXISTS facility CASCADE");
    await pool.query("DROP TABLE IF EXISTS public.facility_migrations");
    await migrate();
    await seed();
    const login = await request(app).post("/api/v1/auth/login").send({
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
    });
    expect(login.status).toBe(200);
    admin = login.body.data.token;
    const s = await auth(request(app).post("/api/v1/auth/users")).send({
      name: "Staff",
      email: "staff@example.com",
      password: "staff-password-12345",
      role: "STAFF",
    });
    expect(s.status).toBe(201);
    staff = (
      await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "staff@example.com", password: "staff-password-12345" })
    ).body.data.token;
    resources = (await auth(request(app).get("/api/v1/resources"))).body.data
      .items;
  }, 30000);
  afterAll(async () => {
    await pool.end();
  });
  it("authenticates safely, enforces roles and revokes JWT on logout", async () => {
    expect((await request(app).get("/api/v1/bookings")).status).toBe(401);
    expect(
      (
        await request(app)
          .post("/api/v1/auth/login")
          .send({ email: "missing@example.com", password: "bad" })
      ).status,
    ).toBe(401);
    expect(
      (
        await auth(request(app).post("/api/v1/sports"), staff).send({
          name: "No",
        })
      ).status,
    ).toBe(403);
    const login = await request(app).post("/api/v1/auth/login").send({
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
    });
    const token = login.body.data.token;
    expect(
      (await auth(request(app).get("/api/v1/auth/me"), token)).body.data
        .password_hash,
    ).toBeUndefined();
    expect(
      (await auth(request(app).post("/api/v1/auth/logout"), token)).status,
    ).toBe(200);
    expect(
      (await auth(request(app).get("/api/v1/auth/me"), token)).status,
    ).toBe(401);
  });
  it("normalizes customer phone numbers and rejects duplicates", async () => {
    const customer = { full_name: "Customer Alpha", phone: "9876543210" };
    const a = await auth(request(app).post("/api/v1/customers")).send(customer);
    expect(a.status).toBe(201);
    expect(a.body.data.phone).toBe("+919876543210");
    expect(
      (
        await auth(request(app).post("/api/v1/customers")).send({
          ...customer,
          phone: "+91 98765 43210",
        })
      ).status,
    ).toBe(409);
    expect(
      (await auth(request(app).get("/api/v1/customers?search=Alpha"))).body.data
        .items,
    ).toHaveLength(1);
  });
  it("creates booking with backend price and audit history, reuses normalized customer", async () => {
    const court = resources[0];
    const input = payload(court, 8, { participants: 4 });
    input.customer.phone = "9876543210";
    const b = await auth(request(app).post("/api/v1/bookings")).send(input);
    expect(b.status).toBe(201);
    expect(b.body.data.total_amount).toBe("400.00");
    expect(b.body.data.customer_name).toBe("Customer Alpha");
    expect(
      (
        await auth(
          request(app).get("/api/v1/bookings/" + b.body.data.id + "/events"),
        )
      ).body.data[0].event_type,
    ).toBe("CREATED");
  });
  it("permits one simultaneous court reservation and rejects all others", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () => book(resources[0], 9)),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(7);
  });
  it("database exclusion rejects overlapping exclusive inserts directly", async () => {
    const {
      rows: [b],
    } = await pool.query(
      "SELECT * FROM facility.bookings WHERE resource_id=$1 LIMIT 1",
      [resources[0].id],
    );
    await expect(
      pool.query(
        `INSERT INTO facility.bookings(booking_code,customer_id,resource_id,start_at,end_at,participants,total_amount,booking_source,status,payment_collection_type,exclusive) VALUES('DIRECT-CONFLICT',$1,$2,$3,$4,1,400,'DESK','CONFIRMED','DESK',false)`,
        [b.customer_id, b.resource_id, b.start_at, b.end_at],
      ),
    ).rejects.toMatchObject({ code: "23P01" });
  });
  it("handles shared capacity across adjacent groups and serializes concurrent requests", async () => {
    const shared = resources.find((r) => r.booking_type === "SHARED");
    expect(
      (
        await auth(request(app).patch("/api/v1/resources/" + shared.id)).send({
          capacity: 5,
        })
      ).status,
    ).toBe(200);
    expect((await book(shared, 9, { participants: 3 })).status).toBe(201);
    expect((await book(shared, 10, { participants: 3 })).status).toBe(201);
    expect(
      (await book(shared, 9, { end_at: stamp(11), participants: 2 })).status,
    ).toBe(201);
    expect((await book(shared, 9, { participants: 1 })).status).toBe(409);
    const results = await Promise.all(
      Array.from({ length: 4 }, () => book(shared, 12, { participants: 2 })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    expect(results.filter((r) => r.status === 409)).toHaveLength(2);
  });
  it("idempotent booking retries return same booking and reject different input", async () => {
    const key = randomUUID(),
      input = payload(resources[1], 9);
    const results = await Promise.all(
      [1, 2].map(() =>
        auth(request(app).post("/api/v1/bookings"))
          .set("Idempotency-Key", key)
          .send(input),
      ),
    );
    expect(results[0].status).toBe(201);
    expect(results[1].body.data.id).toBe(results[0].body.data.id);
    expect(
      (
        await auth(request(app).post("/api/v1/bookings"))
          .set("Idempotency-Key", key)
          .send({ ...input, notes: "changed" })
      ).status,
    ).toBe(409);
  });
  it("cancels without deletion and releases capacity", async () => {
    const b = await book(resources[1], 11);
    expect(b.status).toBe(201);
    const c = await auth(
      request(app).patch("/api/v1/bookings/" + b.body.data.id + "/cancel"),
    ).send({ reason: "Customer request" });
    expect(c.body.data.status).toBe("CANCELLED");
    expect((await book(resources[1], 11)).status).toBe(201);
  });
  it("reschedules with overlap protection and audit events", async () => {
    const a = await book(resources[2], 8),
      b = await book(resources[2], 9);
    expect(
      (
        await auth(
          request(app).patch(
            "/api/v1/bookings/" + a.body.data.id + "/reschedule",
          ),
        ).send({ start_at: stamp(9), end_at: stamp(10) })
      ).status,
    ).toBe(409);
    const changed = await auth(
      request(app).patch("/api/v1/bookings/" + a.body.data.id + "/reschedule"),
    ).send({ start_at: stamp(10), end_at: stamp(11) });
    expect(changed.status).toBe(200);
    const results = await Promise.all(
      [a, b].map((x) =>
        auth(
          request(app).patch(
            "/api/v1/bookings/" + x.body.data.id + "/reschedule",
          ),
        ).send({ start_at: stamp(12), end_at: stamp(13) }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });
  it("records partial/full desk payments, prevents overpayment, handles refunds and retries", async () => {
    const b = (await book(resources[0], 14)).body.data;
    const path = "/api/v1/bookings/" + b.id + "/payments";
    const key = randomUUID();
    const input = {
      amount: 100,
      method: "UPI",
      transaction_reference: randomUUID(),
    };
    const a = await auth(request(app).post(path))
      .set("Idempotency-Key", key)
      .send(input);
    expect(a.status).toBe(201);
    expect(
      (
        await auth(request(app).post(path))
          .set("Idempotency-Key", key)
          .send(input)
      ).body.data.id,
    ).toBe(a.body.data.id);
    expect(
      (await auth(request(app).get("/api/v1/bookings/" + b.id))).body.data
        .payment_status,
    ).toBe("PARTIAL");
    expect(
      (
        await auth(request(app).post(path)).send({
          amount: 301,
          method: "CASH",
        })
      ).status,
    ).toBe(422);
    const full = await auth(request(app).post(path)).send({
      amount: 300,
      method: "CARD",
    });
    expect(full.status).toBe(201);
    expect(
      (await auth(request(app).get("/api/v1/bookings/" + b.id))).body.data
        .payment_status,
    ).toBe("PAID");
    expect(
      (
        await auth(
          request(app).post("/api/v1/bookings/" + b.id + "/refunds"),
        ).send({
          payment_id: a.body.data.id,
          transaction_reference: randomUUID(),
        })
      ).status,
    ).toBe(201);
    expect(
      (await auth(request(app).get("/api/v1/bookings/" + b.id))).body.data
        .paid_amount,
    ).toBe("300.00");
  });
  it("verifies online capture, signature, amount and duplicate events", async () => {
    const b = (
      await book(resources[0], 16, {
        booking_source: "ONLINE",
        payment_option: "PAY_ONLINE",
      })
    ).body.data;
    expect(b.status).toBe("HELD");
    const initiated = await auth(
      request(app).post("/api/v1/payments/online"),
    ).send({ booking_id: b.id });
    expect(initiated.status).toBe(201);
    expect(initiated.body.data.mock).toBe(true);
    const event = captured(initiated.body.data),
      id = randomUUID();
    expect((await signed(event, id, false)).status).toBe(401);
    const bad = structuredClone(event);
    bad.payload.payment.entity.amount = 1;
    expect((await signed(bad)).status).toBe(422);
    expect((await signed(event, id)).status).toBe(200);
    expect((await signed(event, id)).body.data.duplicate).toBe(true);
    expect((await signed(event)).status).toBe(200);
    const result = await auth(request(app).get("/api/v1/bookings/" + b.id));
    expect(result.body.data.status).toBe("CONFIRMED");
    expect(result.body.data.payment_status).toBe("PAID");
    const refund = {
      event: "refund.processed",
      payload: {
        refund: {
          entity: {
            id: "refund_" + randomUUID(),
            payment_id: event.payload.payment.entity.id,
            amount: event.payload.payment.entity.amount,
          },
        },
      },
    };
    expect((await signed(refund)).status).toBe(200);
    expect((await signed(refund)).status).toBe(200);
    expect(
      (await auth(request(app).get("/api/v1/bookings/" + b.id))).body.data
        .paid_amount,
    ).toBe("0.00");
  });
  it("expires unpaid holds and records late payments without resurrecting bookings", async () => {
    const b = (await book(resources[1], 16, { payment_option: "PAY_ONLINE" }))
      .body.data;
    const p = (
      await auth(request(app).post("/api/v1/payments/online")).send({
        booking_id: b.id,
      })
    ).body.data;
    await pool.query(
      "UPDATE facility.bookings SET hold_expires_at=now()-interval '1 second' WHERE id=$1",
      [b.id],
    );
    await expireHolds();
    expect(
      (await auth(request(app).get("/api/v1/bookings/" + b.id))).body.data
        .status,
    ).toBe("EXPIRED");
    expect((await book(resources[1], 16)).status).toBe(201);
    const result = await signed(captured(p));
    expect(result.status).toBe(200);
    expect(result.body.data.requires_refund).toBe(true);
    expect(
      (await auth(request(app).get("/api/v1/bookings/" + b.id))).body.data
        .status,
    ).toBe("EXPIRED");
  });
  it("handles failed provider events and rejects frontend payment success fields", async () => {
    const b = (await book(resources[2], 16, { payment_option: "PAY_ONLINE" }))
      .body.data;
    const p = (
      await auth(request(app).post("/api/v1/payments/online")).send({
        booking_id: b.id,
      })
    ).body.data;
    const event = captured(p);
    event.event = "payment.failed";
    expect((await signed(event)).status).toBe(200);
    expect(
      (await auth(request(app).get("/api/v1/bookings/" + b.id + "/payments")))
        .body.data[0].status,
    ).toBe("FAILED");
    expect(
      (
        await auth(
          request(app).post("/api/v1/bookings/" + b.id + "/payments"),
        ).send({ amount: 400, method: "ONLINE", status: "SUCCESS" })
      ).status,
    ).toBe(400);
  });
  it("respects operating hours, maintenance, inactive resources and invalid intervals", async () => {
    expect((await book(resources[0], 4)).status).toBe(422);
    expect((await book(resources[0], 18, { end_at: stamp(17) })).status).toBe(
      422,
    );
    expect((await book(resources[0], 18, { participants: 0 })).status).toBe(
      400,
    );
    expect((await book(resources[0], 18, { unexpected: true })).status).toBe(
      400,
    );
    expect(
      (
        await auth(
          request(app).post(
            "/api/v1/resources/" + resources[0].id + "/unavailability",
          ),
        ).send({
          start_at: stamp(18),
          end_at: stamp(19),
          reason: "Maintenance",
        })
      ).status,
    ).toBe(201);
    expect((await book(resources[0], 18)).status).toBe(409);
    expect(
      (
        await auth(
          request(app).patch("/api/v1/resources/" + resources[0].id),
        ).send({ is_active: false })
      ).status,
    ).toBe(200);
    expect((await book(resources[0], 20)).status).toBe(422);
    await auth(request(app).patch("/api/v1/resources/" + resources[0].id)).send(
      { is_active: true },
    );
  });
  it("returns filtered/paginated lists, availability and resource schedule", async () => {
    const result = await auth(
      request(app).get("/api/v1/bookings").query({
        date,
        resource_id: resources[0].id,
        limit: 2,
        sort: "total_amount",
        sort_order: "desc",
      }),
    );
    expect(result.status).toBe(200);
    expect(result.body.data.items).toHaveLength(2);
    expect(result.body.data.pagination.total).toBeGreaterThan(2);
    const code = result.body.data.items[0].booking_code;
    expect(
      (await auth(request(app).get("/api/v1/bookings").query({ search: code })))
        .body.data.items,
    ).toHaveLength(1);
    expect(
      (await auth(request(app).get("/api/v1/bookings?sort=DROP%20TABLE")))
        .status,
    ).toBe(400);
    const slots = await auth(
      request(app)
        .get("/api/v1/availability")
        .query({ date, resource_id: resources[0].id, duration_minutes: 60 }),
    );
    expect(slots.status).toBe(200);
    expect(
      slots.body.data.resources[0].slots.find((s) => s.start_at === stamp(9)),
    ).toMatchObject({ available: false });
    const schedule = await auth(
      request(app).get("/api/v1/schedule").query({ date }),
    );
    expect(schedule.status).toBe(200);
    expect(schedule.body.data.resources[0].bookings.length).toBeGreaterThan(0);
  });
  it("confirms zero-price online bookings and rejects rescheduling pending payments", async () => {
    const created = await auth(request(app).post("/api/v1/resources")).send({
      sport_id: Number(resources[0].sport_id),
      name: "Free Community Court",
      capacity: 4,
      booking_type: "EXCLUSIVE",
      price_per_hour: 0,
    });
    expect(created.status).toBe(201);
    const free = created.body.data;
    const hours = Array.from({ length: 7 }, (_, day_of_week) => ({
      day_of_week,
      opening_time: "06:00",
      closing_time: "23:00",
      is_closed: false,
    }));
    expect(
      (
        await auth(
          request(app).put("/api/v1/resources/" + free.id + "/operating-hours"),
        ).send({ hours })
      ).status,
    ).toBe(200);
    const b = await book(free, 8, { payment_option: "PAY_ONLINE" });
    expect(b.status).toBe(201);
    expect(b.body.data.status).toBe("CONFIRMED");
    expect(b.body.data.total_amount).toBe("0.00");
    const paid = (
      await book(resources[1], 20, { payment_option: "PAY_ONLINE" })
    ).body.data;
    expect(
      (
        await auth(request(app).post("/api/v1/payments/online")).send({
          booking_id: paid.id,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await auth(
          request(app).patch("/api/v1/bookings/" + paid.id + "/reschedule"),
        ).send({ start_at: stamp(21), end_at: stamp(22) })
      ).status,
    ).toBe(409);
  });
  it("enforces a valid facility-day boundary and stable retry input ordering", async () => {
    const input = payload(resources[1], 18);
    const key = randomUUID();
    const first = await auth(request(app).post("/api/v1/bookings"))
      .set("Idempotency-Key", key)
      .send(input);
    const reversed = Object.fromEntries(Object.entries(input).reverse());
    const replay = await auth(request(app).post("/api/v1/bookings"))
      .set("Idempotency-Key", key)
      .send(reversed);
    expect(first.status).toBe(201);
    expect(replay.body.data.id).toBe(first.body.data.id);
    expect(
      (
        await book(resources[1], 22, {
          end_at: stamp(
            1,
            0,
            DateTime.fromISO(date).plus({ days: 1 }).toISODate(),
          ),
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await auth(request(app).post("/api/v1/bookings"))
          .set("Content-Type", "application/json")
          .send("{broken")
      ).status,
    ).toBe(400);
  });
  it("matches dashboard aggregates with mutually exclusive financial categories", async () => {
    const paid = (await book(resources[2], 20)).body.data;
    expect(
      (
        await auth(
          request(app).post("/api/v1/bookings/" + paid.id + "/payments"),
        ).send({ amount: 400, method: "CASH" })
      ).status,
    ).toBe(201);
    const result = await auth(
      request(app).get("/api/v1/bookings/summary").query({ date }),
    );
    expect(result.status).toBe(200);
    const {
      rows: [expected],
    } = await pool.query(
      "SELECT count(*)::int n FROM facility.bookings WHERE (start_at AT TIME ZONE 'Asia/Kolkata')::date=$1 AND status='CONFIRMED'",
      [date],
    );
    expect(result.body.data.total_bookings).toBe(expected.n);
    expect(result.body.data.paid).toBeGreaterThan(0);
    expect(result.body.data.collect_at_desk).toBeGreaterThan(0);
    expect(result.body.data.payment_pending_online).toBeGreaterThan(0);
    expect(
      (await auth(request(app).get("/api/v1/bookings/summary?date=2026-02-30")))
        .status,
    ).toBe(400);
  });
});
