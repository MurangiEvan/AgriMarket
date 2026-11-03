import { createHmac, timingSafeEqual } from 'node:crypto';

import { userRole } from './db/schema.js';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type UserRole = (typeof userRole.enumValues)[number];

export type AccessTokenClaims = {
  userId: string;
  role: UserRole;
  sessionId: string;
  expiresAt: number;
};

type EncodedAccessToken = {
  sub?: unknown;
  role?: unknown;
  sid?: unknown;
  exp?: unknown;
};

const tokenHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');

export function createAccessToken(
  user: { id: string; role: UserRole },
  sessionId: string,
  secret: string,
  now = Date.now(),
) {
  const expiresAt = Math.floor(now / 1000) + ACCESS_TOKEN_TTL_SECONDS;
  const payload = Buffer.from(JSON.stringify({
    sub: user.id,
    role: user.role,
    sid: sessionId,
    exp: expiresAt,
  })).toString('base64url');
  const unsignedToken = `${tokenHeader}.${payload}`;
  const signature = createHmac('sha256', secret).update(unsignedToken).digest('base64url');
  return { token: `${unsignedToken}.${signature}`, expiresAt };
}

export function verifyAccessToken(token: string, secret: string, now = Date.now()): AccessTokenClaims | null {
  const [header, payload, suppliedSignature, extra] = token.split('.');
  if (!header || !payload || !suppliedSignature || extra !== undefined || header !== tokenHeader) return null;

  const unsignedToken = `${header}.${payload}`;
  const expectedSignature = createHmac('sha256', secret).update(unsignedToken).digest();
  let actualSignature: Buffer;
  try {
    actualSignature = Buffer.from(suppliedSignature, 'base64url');
  } catch {
    return null;
  }
  if (actualSignature.length !== expectedSignature.length || !timingSafeEqual(actualSignature, expectedSignature)) {
    return null;
  }

  let claims: EncodedAccessToken;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as EncodedAccessToken;
  } catch {
    return null;
  }

  if (
    typeof claims.sub !== 'string' ||
    typeof claims.sid !== 'string' ||
    typeof claims.exp !== 'number' ||
    !Number.isInteger(claims.exp) ||
    claims.exp <= Math.floor(now / 1000) ||
    !isUserRole(claims.role)
  ) {
    return null;
  }

  return {
    userId: claims.sub,
    role: claims.role,
    sessionId: claims.sid,
    expiresAt: claims.exp,
  };
}

function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (userRole.enumValues as readonly string[]).includes(value);
}
