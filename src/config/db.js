import "dotenv/config";
import { Pool } from "pg";
const pool = new Pool({
  ...(process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.PGHOST || "127.0.0.1",
        port: Number(process.env.PGPORT || 5432),
        user: process.env.PGUSER || "postgres",
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE || "aatman",
      }),
  max: 10,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
});
pool.on("error", () => console.error("Database pool connection error"));
export default pool;
