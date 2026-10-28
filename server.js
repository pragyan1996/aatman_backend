import "dotenv/config";
import app from "./src/app.js";
import pool from "./src/config/db.js";
import { env, assertConfig } from "./src/config/env.js";
import logger from "./src/utils/logger.js";
import { expireHolds } from "./src/jobs/expire-booking-holds.js";
assertConfig();
await pool.query("SELECT 1 FROM facility.users LIMIT 1");
const server = app.listen(env.port, () =>
  logger.info({ port: env.port }, "API listening"),
);
const timer = setInterval(
  () =>
    expireHolds().catch((e) =>
      logger.error(
        { code: e.code || "EXPIRATION_ERROR" },
        "Hold expiration failed",
      ),
    ),
  30000,
);
timer.unref();
server.on("error", () => {
  logger.error("Server failed");
  process.exitCode = 1;
});
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  const deadline = setTimeout(() => process.exit(1), 10000);
  deadline.unref();
  server.close(async () => {
    await pool.end();
    clearTimeout(deadline);
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
