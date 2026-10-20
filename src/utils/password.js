import { randomBytes, scrypt as callback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(callback);
const options = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export const hashPassword = async (password) => {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64, options);
  return `scrypt$32768$8$1$${salt}$${hash.toString('hex')}`;
};

export const verifyPassword = async (password, stored) => {
  const match = /^scrypt\$32768\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(stored || '');
  // Perform equivalent work for absent accounts or unsupported stored credentials.
  const salt = match?.[1] || '0'.repeat(32);
  const expected = Buffer.from(match?.[2] || '0'.repeat(128), 'hex');
  const actual = await scrypt(password, salt, 64, options);
  return timingSafeEqual(actual, expected) && Boolean(match);
};
