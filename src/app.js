import express from "express";
import helmet from "helmet";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { rateLimit } from "express-rate-limit";
import auth from "./modules/auth/auth.routes.js";
import facility from "./modules/facility/facility.routes.js";
import bookings from "./modules/bookings/booking.routes.js";
import availability from "./modules/availability/availability.routes.js";
import payments from "./modules/payments/payment.routes.js";
import { webhook } from "./modules/payments/payment.controller.js";
import { ok, pool } from "./modules/common.js";
import logger from "./utils/logger.js";
import { notFound, errorHandler } from "./middlewares/error.middleware.js";
const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(
  cors({
    origin: (process.env.CORS_ORIGINS || "http://localhost:3000")
      .split(",")
      .map((s) => s.trim()),
  }),
);
app.use((req, res, next) => {
  req.id = randomUUID();
  res.set("X-Request-ID", req.id);
  const start = Date.now();
  res.on("finish", () =>
    logger.info(
      {
        request_id: req.id,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration_ms: Date.now() - start,
      },
      "request",
    ),
  );
  next();
});
app.use(
  rateLimit({
    windowMs: 60000,
    limit: 300,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      success: false,
      message: "Too many requests",
      error: { code: "RATE_LIMITED" },
    },
  }),
);
app.post(
  "/api/v1/webhooks/payments",
  express.raw({ type: "application/json", limit: "128kb" }),
  webhook,
);
app.use(express.json({ limit: "32kb" }));
app.get("/api/v1/health", async (req, res) => {
  await pool.query("SELECT 1");
  ok(res, { status: "ok" });
});
app.use("/api/v1/auth", auth);
// Lazy loading preserves the original Basic Auth/session API without requiring its secrets at startup.
app.use("/api/v1/legacy/auth", async (req, res, next) => {
  try {
    const { default: legacy } = await import("./routes/auth.routes.js");
    legacy(req, res, next);
  } catch (e) {
    next(e);
  }
});
app.use("/api/v1", facility);
app.use("/api/v1/bookings", bookings);
app.use("/api/v1", availability);
app.use("/api/v1", payments);
app.use(notFound);
app.use(errorHandler);
export default app;
