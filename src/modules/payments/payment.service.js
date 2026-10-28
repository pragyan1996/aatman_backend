import Decimal from "decimal.js";
import { env } from "../../config/env.js";
import { transaction, required, fail } from "../common.js";
import { locked, idempotent } from "../bookings/booking.service.js";
import { detail, event } from "../bookings/booking.repository.js";
import * as provider from "./provider.js";
import * as repo from "./payment.repository.js";
export async function list(id) {
  await detail(id);
  return repo.list(id);
}
export async function desk(id, data, actor, key) {
  return transaction((db) =>
    idempotent(db, "desk:" + actor + ":" + id, key, data, async () => {
      const b = await locked(db, id);
      if (b.status !== "CONFIRMED" || b.payment_collection_type !== "DESK")
        throw fail(
          422,
          "Desk payments require a confirmed desk-collection booking",
        );
      const before = await detail(id, db);
      if (new Decimal(data.amount).gt(before.outstanding_amount))
        throw fail(422, "Payment exceeds outstanding balance");
      const p = await repo.desk(db, id, data);
      await event(db, id, "PAYMENT_RECORDED", null, p, actor);
      return p;
    }),
  );
}
function onlineResponse(payment) {
  return {
    ...payment,
    currency: "INR",
    provider_key:
      payment.provider === "razorpay" ? process.env.RAZORPAY_KEY_ID : undefined,
    mock: payment.provider === "mock",
  };
}
export async function online(data, actor, key) {
  return transaction((db) =>
    idempotent(db, "online:" + actor, key, data, async () => {
      const b = await locked(db, data.booking_id);
      if (
        !["CONFIRMED", "HELD"].includes(b.status) ||
        b.payment_collection_type !== "ONLINE"
      )
        throw fail(422, "Booking is not payable online");
      const before = await detail(b.id, db);
      if (new Decimal(before.outstanding_amount).lte(0))
        throw fail(422, "Booking is already paid");
      const existing = await repo.pending(db, b.id);
      if (existing) return onlineResponse(existing);
      const cents = new Decimal(before.outstanding_amount)
        .times(100)
        .toNumber();
      const order = await provider.createOrder(cents, b.booking_code);
      const p = await repo.online(
        db,
        b.id,
        before.outstanding_amount,
        env.provider,
        order.id,
      );
      await event(db, b.id, "PAYMENT_INITIATED", null, p, actor);
      return onlineResponse(p);
    }),
  );
}
export async function refund(id, data, actor, key) {
  return transaction((db) =>
    idempotent(db, "refund:" + actor + ":" + id, key, data, async () => {
      const b = await locked(db, id);
      const p = required(await repo.successful(db, data.payment_id, id));
      if (p.method === "ONLINE")
        throw fail(
          422,
          "Initiate provider refunds in the provider dashboard; verified refund webhooks reconcile automatically",
        );
      const row = await repo.refund(db, p, data.transaction_reference);
      await event(db, b.id, "REFUND_RECORDED", null, row, actor);
      return row;
    }),
  );
}
export async function webhook(raw, headers) {
  const e = provider.parseEvent(raw, headers);
  if (e.ignored) return { ignored: true };
  if (typeof e.id !== "string" || e.id.length > 200)
    throw fail(400, "Webhook event ID required");
  return transaction(async (db) => {
    await repo.advisoryLock(db, e.id);
    if (await repo.delivered(db, e.id)) return { duplicate: true };
    const peek = required(await repo.lookupEvent(db, e, env.provider));
    const b = await locked(db, peek.booking_id);
    const p = required(await repo.lock(db, peek.id));
    if (!new Decimal(p.amount).times(100).eq(e.amount))
      throw fail(422, "Payment amount does not match");
    if (e.type === "refund.processed") {
      if (p.status !== "SUCCESS")
        throw fail(422, "Only captured payments can be refunded");
      const existing = await repo.refunded(db, p.id);
      if (!existing) {
        const row = await repo.refund(db, p, e.reference, env.provider);
        await event(db, b.id, "REFUND_VERIFIED", null, row, null);
      }
    } else if (e.type === "payment.captured") {
      if (p.status !== "SUCCESS") {
        const before = await detail(b.id, db);
        if (new Decimal(p.amount).gt(before.outstanding_amount))
          throw fail(
            422,
            "Captured payment exceeds outstanding balance; reconcile with provider",
          );
        await repo.capture(db, p.id, e.reference);
        if (b.status === "HELD") await repo.confirmBooking(db, b.id);
        await event(
          db,
          b.id,
          ["EXPIRED", "CANCELLED"].includes(b.status)
            ? "LATE_PAYMENT_REQUIRES_REFUND"
            : "PAYMENT_VERIFIED",
          p,
          { status: "SUCCESS", reference: e.reference },
          null,
        );
      }
    } else if (p.status === "PENDING") await repo.failed(db, p.id);
    await repo.markDelivered(db, e.id);
    return {
      processed: true,
      requires_refund:
        e.type === "payment.captured" &&
        ["EXPIRED", "CANCELLED"].includes(b.status),
    };
  });
}
