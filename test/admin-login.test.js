import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/utils/password.js';
import { loginSchema } from '../src/validations/auth.validation.js';

test('password hashes use random salts and reject wrong or plaintext credentials', async () => {
  const password = 'Example password 123';
  const first = await hashPassword(password);
  assert.notEqual(first, await hashPassword(password));
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword('wrong', first), false);
  assert.equal(await verifyPassword(password, password), false);
  assert.equal(await verifyPassword(password, undefined), false);
});

test('login validation normalizes email, preserves password, rejects invalid and unknown inputs', () => {
  const { value, error } = loginSchema.validate({ email: ' ADMIN@example.com ', password: ' abc ' });
  assert.equal(error, undefined);
  assert.deepEqual(value, { email: 'admin@example.com', password: ' abc ' });
  for (const body of [undefined, {}, { email: 'bad', password: 'abc' },
    { email: 'a@example.com', password: '' }, { email: 'a@example.com', password: 'abc', role: 'admin' }]) {
    assert.ok(loginSchema.validate(body).error);
  }
});
