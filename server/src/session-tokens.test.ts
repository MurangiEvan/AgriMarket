import assert from 'node:assert/strict';
import test from 'node:test';

import { ACCESS_TOKEN_TTL_SECONDS, createAccessToken, verifyAccessToken } from './session-tokens.js';

const secret = 'test-session-secret-that-is-long-enough';
const now = Date.UTC(2026, 0, 1);
const user = { id: 'a7d95cef-92ac-47fd-b490-3c7f7b604ed3', role: 'buyer' as const };
const sessionId = 'c6381db3-1192-474f-85a3-4ea599ba4204';

test('access tokens are signed, scoped to a session, and expire after the configured lifetime', () => {
  const { token, expiresAt } = createAccessToken(user, sessionId, secret, now);
  assert.equal(expiresAt, Math.floor(now / 1000) + ACCESS_TOKEN_TTL_SECONDS);
  assert.deepEqual(verifyAccessToken(token, secret, now), {
    userId: user.id,
    role: user.role,
    sessionId,
    expiresAt,
  });
  assert.equal(verifyAccessToken(token, secret, now + ACCESS_TOKEN_TTL_SECONDS * 1000), null);
});

test('access tokens reject modified signatures and different server secrets', () => {
  const { token } = createAccessToken(user, sessionId, secret, now);
  const [header, payload, signature] = token.split('.');
  assert.ok(header && payload && signature);
  assert.equal(verifyAccessToken(`${header}.${payload}.${signature.slice(0, -1)}x`, secret, now), null);
  assert.equal(verifyAccessToken(token, `${secret}-different`, now), null);
  assert.equal(verifyAccessToken('not-a-token', secret, now), null);
});
