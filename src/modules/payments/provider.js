import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import { fail } from "../common.js";
export function verifySignature(raw, signature, secret) {
  if (!secret || !/^[a-f0-9]{64}$/i.test(signature || "")) return false;
  const expected = createHmac("sha256", secret).update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
export function assertProvider() {
  if (env.provider === "mock") {
    if (process.env.NODE_ENV === "production")
      throw fail(503, "Mock payments unavailable in production");
  } else if (
    env.provider !== "razorpay" ||
    !process.env.RAZORPAY_KEY_ID ||
    !process.env.RAZORPAY_KEY_SECRET
  )
    throw fail(503, "Payment provider is not configured");
}
export async function createOrder(amount, receipt) {
  assertProvider();
  if (env.provider === "mock")
    return {
      id: "mock_order_" + randomUUID(),
      amount,
      currency: "INR",
      mock: true,
    };
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(
          process.env.RAZORPAY_KEY_ID + ":" + process.env.RAZORPAY_KEY_SECRET,
        ).toString("base64"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ amount, currency: "INR", receipt }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw fail(502, "Payment provider request failed", "PROVIDER_ERROR");
  return response.json();
}
export function parseEvent(raw, headers) {
  assertProvider();
  const mock = env.provider === "mock";
  if (
    !verifySignature(
      raw,
      headers[mock ? "x-mock-signature" : "x-razorpay-signature"],
      mock
        ? process.env.MOCK_WEBHOOK_SECRET
        : process.env.RAZORPAY_WEBHOOK_SECRET,
    )
  )
    throw fail(401, "Invalid webhook signature", "INVALID_SIGNATURE");
  let data;
  try {
    data = JSON.parse(raw.toString("utf8"));
  } catch {
    throw fail(400, "Invalid webhook JSON");
  }
  const payment = data.payload?.payment?.entity;
  const refund = data.payload?.refund?.entity;
  const supported = ["payment.captured", "payment.failed", "refund.processed"];
  if (!supported.includes(data.event)) return { ignored: true };
  const entity = data.event === "refund.processed" ? refund : payment;
  if (
    !entity?.id ||
    !Number.isSafeInteger(entity.amount) ||
    entity.amount <= 0 ||
    (!refund && entity.currency !== "INR")
  )
    throw fail(400, "Invalid webhook payment");
  return {
    id: headers[mock ? "x-mock-event-id" : "x-razorpay-event-id"],
    type: data.event,
    reference: entity.id,
    orderId: payment?.order_id,
    paymentId: refund?.payment_id,
    amount: entity.amount,
  };
}
