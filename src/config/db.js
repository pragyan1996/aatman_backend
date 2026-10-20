require('dotenv').config({ quiet: true });
const { Pool } = require('pg');
module.exports = new Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || 'aatman',
  max: 10,
});
