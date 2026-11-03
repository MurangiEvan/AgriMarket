import { createHmac, randomBytes } from 'node:crypto';
import type { RequestHandler } from 'express';
import { and, eq, gt } from 'drizzle-orm';

import type { Database } from '../db/client.js';
import { sessions, users } from '../db/schema.js';
import { HttpError } from '../http.js';
import { verifyAccessToken } from '../session-tokens.js';

export const SESSION_COOKIE = 'agrimarket_session';
export const ACCESS_COOKIE = 'agrimarket_access';

export function hashSessionToken(token: string, secret: string): string {
  return createHmac('sha256', secret).update(token).digest('hex');
}

export function createSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function requireAuth(db: Database, sessionSecret: string): RequestHandler {
  return async (request, _response, next) => {
    try {
      const authorization = request.get('authorization');
      const bearerToken = authorization?.match(/^Bearer ([A-Za-z0-9._-]+)$/)?.[1];
      const token = bearerToken ?? request.cookies?.[ACCESS_COOKIE];
      if (typeof token !== 'string') throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in to continue.');

      const claims = verifyAccessToken(token, sessionSecret);
      if (!claims) throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in to continue.');

      const [session] = await db
        .select({
          id: sessions.id,
          userId: users.id,
          role: users.role,
          email: users.email,
          isActive: users.isActive,
        })
        .from(sessions)
        .innerJoin(users, eq(sessions.userId, users.id))
        .where(and(
          eq(sessions.id, claims.sessionId),
          eq(users.id, claims.userId),
          gt(sessions.expiresAt, new Date()),
        ))
        .limit(1);

      if (!session || !session.isActive) {
        throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
      }

      request.auth = {
        id: session.userId,
        role: session.role,
        email: session.email,
        sessionId: session.id,
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireRole(...roles: Array<'buyer' | 'seller' | 'admin'>): RequestHandler {
  return (request, _response, next) => {
    if (!request.auth) {
      next(new HttpError(401, 'UNAUTHENTICATED', 'Sign in to continue.'));
      return;
    }
    if (!isRoleAllowed(request.auth.role, roles)) {
      next(new HttpError(403, 'FORBIDDEN', 'You are not allowed to perform this action.'));
      return;
    }
    next();
  };
}

export function isRoleAllowed(role: 'buyer' | 'seller' | 'admin', requiredRoles: readonly ('buyer' | 'seller' | 'admin')[]) {
  return requiredRoles.includes(role);
}

export function isTrustedOrigin(
  origin: string | undefined,
  allowedOrigins: ReadonlySet<string>,
  allowLocalDevelopmentOrigins = false,
) {
  if (!origin) return false;
  if (allowedOrigins.has(origin)) return true;
  if (!allowLocalDevelopmentOrigins) return false;

  try {
    const parsed = new URL(origin);
    return (
      parsed.origin === origin &&
      parsed.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
    );
  } catch {
    return false;
  }
}

export function requireTrustedOrigin(
  allowedOrigins: ReadonlySet<string>,
  allowLocalDevelopmentOrigins = false,
): RequestHandler {
  return (request, _response, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      next();
      return;
    }
    const origin = request.get('origin');
    if (!origin && request.get('x-agrimarket-client') === 'native') {
      next();
      return;
    }
    if (!isTrustedOrigin(origin, allowedOrigins, allowLocalDevelopmentOrigins)) {
      next(new HttpError(403, 'UNTRUSTED_ORIGIN', 'The request origin is not allowed.'));
      return;
    }
    next();
  };
}