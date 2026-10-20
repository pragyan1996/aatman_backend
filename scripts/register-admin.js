// Trusted operator command; intentionally not exposed as a public API.
import pool from '../src/config/db.js';
import { randomBytes, scrypt: scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import readline from 'node:readline/promises';
import { Writable } from 'node:stream';
const scrypt = promisify(scryptCallback);

async function main() {
  if (!process.stdin.isTTY) throw new Error('Run this command in an interactive terminal.');
  let hidePassword = false;
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!hidePassword) process.stdout.write(chunk, encoding);
      callback();
    },
  });
  const input = readline.createInterface({ input: process.stdin, output, terminal: true });
  let data;
  try {
    const email = (await input.question('Email: ')).trim().toLowerCase();
    const phone = (await input.question('Phone (e.g. +919876543210): ')).trim();
    const name = (await input.question('Name: ')).trim();
    const role = (await input.question('Role [admin]: ')).trim() || 'admin';
    // Hide terminal echo while reading the password.
    process.stdout.write('Password (12–128 characters): ');
    hidePassword = true;
    const password = await input.question('');
    process.stdout.write('\n');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('Invalid email.');
    if (!/^\+[1-9][0-9]{7,14}$/.test(phone)) throw new Error('Phone must include a country code.');
    if (!name || name.length > 150) throw new Error('Name must contain 1–150 characters.');
    if (password.length < 12 || password.length > 128) throw new Error('Password must contain 12–128 characters.');
    const salt = randomBytes(16).toString('hex');
    const hash = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    data = { email, phone, name, role, passwordHash: `scrypt$32768$8$1$${salt}$${hash.toString('hex')}` };
  } finally {
    input.close();
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const role = await client.query('SELECT id FROM roles WHERE name = $1', [data.role]);
    if (!role.rowCount) throw new Error('Unknown role. Create the role before assigning it.');
    const result = await client.query(
      'INSERT INTO admin_users (email, phone, name, password_hash) VALUES ($1, $2, $3, $4) RETURNING id',
      [data.email, data.phone, data.name, data.passwordHash],
    );
    await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [result.rows[0].id, role.rows[0].id]);
    await client.query('COMMIT');
    console.log(`Admin ${result.rows[0].id} registered with role ${data.role}.`);
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    if (error.code === '23505') throw new Error('Email or phone is already registered.');
    throw error;
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Admin registration failed:', error.message);
  process.exitCode = 1;
});
