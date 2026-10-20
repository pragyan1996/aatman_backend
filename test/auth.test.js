import { test } from 'node:test';
import assert from 'node:assert/strict';
import pool from '../src/config/db.js';
import provider from '../src/services/otp.service.js';
import * as service from '../src/services/auth.service.js';
import { normalizePhone } from '../src/utils/auth.js';

test('phone validation requires country code format and normalizes plus', () => {
  assert.equal(normalizePhone('+919876543210'), '919876543210');
  for (const value of [null, 919876543210, '0123456789', 'abc', '91 9876543210']) {
    assert.throws(() => normalizePhone(value), { status: 400 });
  }
});

test('verification consumes a challenge once, limits attempts, and stores only token hash', async () => {
  const originalConnection = pool.connect;
  const originalVerify = provider.verifyOtp;
  let attempts = 0;
  let consumed = false;
  let providerCalls = 0;
  let storedHash;
  const db = {
    release: () => {},
    query: async (sql, params) => {
      if (sql.includes('FROM otp_challenges')) return { rows: [{ consumed, attempts, valid: true }] };
      if (sql.includes('attempts = attempts + 1')) attempts++;
      if (sql.includes('consumed = TRUE')) consumed = true;
      if (sql.includes('SELECT id, phone')) return { rows: [{ id: 1, phone: '919876543210' }] };
      if (sql.includes('INSERT INTO sessions')) storedHash = params[0];
      return { rows: [] };
    },
  };
  pool.connect = async () => db;
  provider.verifyOtp = async (phone, otp) => { providerCalls++; return otp === '123456'; };
  try {
    for (let i = 0; i < 5; i++) await assert.rejects(service.verifyOtp('919876543210', '000000'), { status: 400 });
    await assert.rejects(service.verifyOtp('919876543210', '123456'), { status: 400 });
    assert.equal(providerCalls, 5);
    attempts = 0;
    const result = await service.verifyOtp('919876543210', '123456');
    assert.match(result.token, /^[a-f0-9]{64}$/);
    assert.notEqual(result.token, storedHash);
    assert.equal(consumed, true);
    await assert.rejects(service.verifyOtp('919876543210', '123456'), { status: 400 });
    assert.equal(providerCalls, 6);
  } finally {
    pool.connect = originalConnection;
    provider.verifyOtp = originalVerify;
    await pool.end();
  }
});
