// One-off: mint the hardcoded JWT for the app to use as its bearer token.
// Usage:
//   JWT_SECRET=<your supabase jwt secret> USER_ID=<your uuid> node scripts/generate-jwt.mjs
//
// Copy the output into app.json under expo.extra.supabase.authToken.

import crypto from 'node:crypto';

const secret = process.env.JWT_SECRET;
const userId = process.env.USER_ID;
if (!secret || !userId) {
  console.error('Set JWT_SECRET and USER_ID env vars.');
  process.exit(1);
}

const header = { alg: 'HS256', typ: 'JWT' };
const now = Math.floor(Date.now() / 1000);
const payload = {
  role: 'authenticated',
  user_id: userId,
  iat: now,
  // 50 years; effectively non-expiring for MVP.
  exp: now + 60 * 60 * 24 * 365 * 50,
};

const b64url = (obj) =>
  Buffer.from(JSON.stringify(obj))
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

const signingInput = `${b64url(header)}.${b64url(payload)}`;
const signature = crypto
  .createHmac('sha256', secret)
  .update(signingInput)
  .digest('base64')
  .replace(/=+$/, '')
  .replace(/\+/g, '-')
  .replace(/\//g, '_');

console.log(`${signingInput}.${signature}`);
