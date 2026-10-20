import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import pool from '../src/config/db.js';
(async () => {
  try {
    for (const file of ['schema.sql', 'postgres/admin-schema.sql']) {
      const sql = fs.readFileSync(fileURLToPath(new URL(`../database/${file}`, import.meta.url)), 'utf8');
      await pool.query(sql);
    }
    console.log('Database tables ready.');
  } catch (error) {
    console.error('Database setup failed:', error.code || 'Unknown database error');
    process.exitCode = 1;
  } finally { await pool.end(); }
})();
