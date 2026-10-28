import "dotenv/config";
import { IANAZone } from "luxon";
export const env = {
  port: Number(process.env.PORT || 3002),
  timezone: process.env.FACILITY_TIMEZONE || "Asia/Kolkata",
  slotMinutes: Number(process.env.SLOT_INTERVAL_MINUTES || 30),
  holdMinutes: Number(process.env.HOLD_MINUTES || 10),
  jwtSecret: process.env.JWT_SECRET,
  provider: process.env.PAYMENT_PROVIDER || "mock",
};
export function assertConfig() {
  if (!env.jwtSecret || env.jwtSecret.length < 32)
    throw new Error("JWT_SECRET must contain at least 32 characters");
  if (!IANAZone.isValidZone(env.timezone))
    throw new Error("Invalid FACILITY_TIMEZONE");
  if (
    !Number.isInteger(env.slotMinutes) ||
    env.slotMinutes < 1 ||
    env.slotMinutes > 60 ||
    60 % env.slotMinutes !== 0 ||
    !Number.isInteger(env.holdMinutes) ||
    env.holdMinutes < 1
  )
    throw new Error("Invalid slot/hold configuration");
  if (
    process.env.NODE_ENV === "production" &&
    (env.provider !== "razorpay" ||
      !process.env.RAZORPAY_KEY_ID ||
      !process.env.RAZORPAY_KEY_SECRET ||
      !process.env.RAZORPAY_WEBHOOK_SECRET)
  )
    throw new Error("Production requires configured Razorpay credentials");
}
