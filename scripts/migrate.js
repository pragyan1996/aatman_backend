import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import pool from "../src/config/db.js";
export async function migrate() {
  const db = await pool.connect();
  try {
    await db.query("SELECT pg_advisory_lock(68412001)");
    await db.query(
      "CREATE TABLE IF NOT EXISTS public.facility_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ DEFAULT now())",
    );
    for (const file of (
      await readdir(new URL("../migrations/", import.meta.url))
    )
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      const sql = await readFile(
        new URL("../migrations/" + file, import.meta.url),
        "utf8",
      );
      const checksum = createHash("sha256").update(sql).digest("hex");
      const {
        rows: [applied],
      } = await db.query(
        "SELECT checksum FROM public.facility_migrations WHERE name=$1",
        [file],
      );
      if (applied) {
        if (applied.checksum !== checksum)
          throw new Error("Migration checksum mismatch: " + file);
        continue;
      }
      await db.query("BEGIN");
      try {
        await db.query(sql);
        await db.query(
          "INSERT INTO public.facility_migrations(name,checksum) VALUES($1,$2)",
          [file, checksum],
        );
        await db.query("COMMIT");
      } catch (e) {
        await db.query("ROLLBACK");
        throw e;
      }
    }
  } finally {
    await db.query("SELECT pg_advisory_unlock(68412001)");
    db.release();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await migrate();
    console.log("Migrations applied");
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
