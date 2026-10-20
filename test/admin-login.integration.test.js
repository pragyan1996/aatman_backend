import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

// Explicit opt-in: creates and removes its own isolated PostgreSQL schema.
test('admin registration and login HTTP flow', { skip: !process.env.RUN_DB_TESTS }, async (t) => {
  const schema = `test_admin_${randomBytes(8).toString('hex')}`;
  process.env.PGOPTIONS = `-c search_path=${schema}`;
  process.env.BASIC_AUTH_USERNAME = 'integration';
  process.env.BASIC_AUTH_PASSWORD = randomBytes(24).toString('hex');
  const { default: pool } = await import('../src/config/db.js');
  const { default: app } = await import('../src/app.js');
  let server;
  const basic = 'Basic ' + Buffer.from(`${process.env.BASIC_AUTH_USERNAME}:${process.env.BASIC_AUTH_PASSWORD}`).toString('base64');
  const payload = { name: 'Test Admin', email: 'test@example.com', phone: '+919876543210', password: 'Test password 12345' };
  let token;
  let base;
  const request = async (path, { auth = basic, body, method = 'POST' } = {}) => {
    const response = await fetch(base + path, { method, headers: {
      ...(auth ? { Authorization: auth } : {}), 'Content-Type': 'application/json',
    }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const data = response.status === 204 ? null : await response.json();
    return { status: response.status, data, headers: response.headers };
  };
  const login = (password = payload.password) => request('/login', { body: { email: payload.email, password } });
  try {
    await pool.query(`CREATE SCHEMA ${schema}`);
    await pool.query(await readFile(new URL('../database/postgres/admin-schema.sql', import.meta.url), 'utf8'));
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    base = `http://127.0.0.1:${server.address().port}/api/v1/auth`;
    await t.test('registration stores hash and returns safe fields; duplicate returns 409', async () => {
      const result = await request('/register', { body: payload });
      assert.equal(result.status, 201);
      assert.equal(result.data.user.password_hash, undefined);
      const { rows: [admin] } = await pool.query('SELECT password_hash FROM admin_users');
      assert.match(admin.password_hash, /^scrypt\$/);
      assert.equal((await request('/register', { body: payload })).status, 409);
    });
    await t.test('missing Basic Auth returns 401 and invalid payload returns 400', async () => {
      assert.equal((await request('/login', { auth: '', body: {} })).status, 401);
      assert.equal((await request('/login', { body: {} })).status, 400);
    });
    await t.test('wrong password and unknown email use the same generic error', async () => {
      const wrong = await login('wrong');
      const unknown = await request('/login', { body: { email: 'missing@example.com', password: 'wrong' } });
      assert.equal(wrong.status, 401);
      assert.equal(unknown.status, 401);
      assert.deepEqual(wrong.data, unknown.data);
    });
    await t.test('login issues a hashed session; bearer token accesses me', async () => {
      const result = await login();
      assert.equal(result.status, 200);
      assert.equal(result.headers.get('cache-control'), 'no-store');
      token = result.data.token;
      assert.match(token, /^[a-f0-9]{64}$/);
      assert.equal(result.data.user.password_hash, undefined);
      const { rows: [session] } = await pool.query('SELECT token_hash FROM admin_sessions');
      assert.notEqual(session.token_hash, token);
      const me = await request('/me', { method: 'GET', auth: `Bearer ${token}` });
      assert.equal(me.status, 200);
      assert.equal(me.data.user.email, payload.email);
      assert.equal((await request('/me', { method: 'GET', auth: '' })).status, 401);
    });
    await t.test('logout revokes session and expired sessions are rejected', async () => {
      assert.equal((await request('/logout', { auth: `Bearer ${token}` })).status, 204);
      assert.equal((await request('/me', { method: 'GET', auth: `Bearer ${token}` })).status, 401);
      token = (await login()).data.token;
      await pool.query("UPDATE admin_sessions SET expires_at = clock_timestamp() - INTERVAL '1 second'");
      assert.equal((await request('/me', { method: 'GET', auth: `Bearer ${token}` })).status, 401);
    });
    await t.test('disabled accounts cannot log in or use existing sessions', async () => {
      token = (await login()).data.token;
      await pool.query("UPDATE admin_users SET status = 'disabled'");
      assert.equal((await login()).status, 401);
      assert.equal((await request('/me', { method: 'GET', auth: `Bearer ${token}` })).status, 401);
      await pool.query("UPDATE admin_users SET status = 'active'");
    });
    await t.test('five failed attempts lock login; expiry allows successful login and resets counter', async () => {
      for (let i = 0; i < 5; i++) assert.equal((await login('wrong')).status, 401);
      assert.equal((await login()).status, 401);
      await pool.query("UPDATE admin_users SET locked_until = clock_timestamp() - INTERVAL '1 second'");
      assert.equal((await login()).status, 200);
      const { rows: [admin] } = await pool.query('SELECT failed_login_attempts, locked_until FROM admin_users');
      assert.equal(admin.failed_login_attempts, 0);
      assert.equal(admin.locked_until, null);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await pool.end();
  }
});
