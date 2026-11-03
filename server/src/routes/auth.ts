import { randomUUID } from 'node:crypto';
import { compare, hash } from 'bcryptjs';
import { and, eq, gt } from 'drizzle-orm';
import { Router, type Response } from 'express';

import type { Database } from '../db/client.js';
import { sessions, users } from '../db/schema.js';
import { HttpError, asyncRoute } from '../http.js';
import {
  ACCESS_COOKIE,
  createSessionToken,
  hashSessionToken,
  requireAuth,
  SESSION_COOKIE,
} from '../middleware/auth.js';
import { ACCESS_TOKEN_TTL_SECONDS, createAccessToken, REFRESH_TOKEN_TTL_MS } from '../session-tokens.js';
import { loginSchema, refreshSchema, registrationSchema } from '../validation.js';

type AuthUser = { id: string; email: string; role: 'buyer' | 'seller' | 'admin' };

export function createAuthRouter(db: Database, secureCookie: boolean, sessionSecret: string): Router {
  const router = Router();

  router.post(
    '/register',
    asyncRoute(async (request, response) => {
      const input = registrationSchema.parse(request.body);
      const email = input.email.trim().toLowerCase();
      const passwordHash = await hash(input.password, 12);
      const [user] = await db
        .insert(users)
        .values({ email, passwordHash, role: input.role })
        .returning({ id: users.id, email: users.email, role: users.role });
      if (!user) throw new Error('User registration did not return a user.');
      const session = await issueSession(db, user, sessionSecret);
      sendCredentials(response, session, secureCookie, isNativeClient(request));
      response.status(201).json({ data: credentialsResponse(session, user, isNativeClient(request)) });
    }),
  );

  router.post(
    '/login',
    asyncRoute(async (request, response) => {
      const input = loginSchema.parse(request.body);
      const email = input.email.trim().toLowerCase();
      const [user] = await db
        .select({
          id: users.id,
          email: users.email,
          role: users.role,
          isActive: users.isActive,
          passwordHash: users.passwordHash,
        })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      if (!user || !user.isActive || !(await compare(input.password, user.passwordHash))) {
        throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
      }

      const publicUser = { id: user.id, email: user.email, role: user.role };
      const session = await issueSession(db, publicUser, sessionSecret);
      const nativeClient = isNativeClient(request);
      sendCredentials(response, session, secureCookie, nativeClient);
      response.json({ data: credentialsResponse(session, publicUser, nativeClient) });
    }),
  );

  router.post(
    '/refresh',
    asyncRoute(async (request, response) => {
      const nativeClient = isNativeClient(request);
      const body = refreshSchema.parse(request.body ?? {});
      const refreshToken = nativeClient ? body.refreshToken : request.cookies?.[SESSION_COOKIE];
      if (!refreshToken) {
        clearAuthCookies(response, secureCookie);
        throw new HttpError(401, 'SESSION_EXPIRED', 'Please sign in again.');
      }

      const tokenHash = hashSessionToken(refreshToken, sessionSecret);
      const [current] = await db
        .select({
          id: sessions.id,
          userId: users.id,
          email: users.email,
          role: users.role,
        })
        .from(sessions)
        .innerJoin(users, eq(sessions.userId, users.id))
        .where(and(
          eq(sessions.tokenHash, tokenHash),
          gt(sessions.expiresAt, new Date()),
          eq(users.isActive, true),
        ))
        .limit(1);
      if (!current) {
        clearAuthCookies(response, secureCookie);
        throw new HttpError(401, 'SESSION_EXPIRED', 'Please sign in again.');
      }

      const nextRefreshToken = createSessionToken();
      const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
      const [rotated] = await db
        .update(sessions)
        .set({ tokenHash: hashSessionToken(nextRefreshToken, sessionSecret), expiresAt })
        .where(and(eq(sessions.id, current.id), eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
        .returning({ id: sessions.id });
      if (!rotated) {
        clearAuthCookies(response, secureCookie);
        throw new HttpError(401, 'SESSION_EXPIRED', 'Please sign in again.');
      }

      const session = issueAccessCredential(
        { id: current.userId, role: current.role },
        current.id,
        nextRefreshToken,
        sessionSecret,
        expiresAt,
      );
      sendCredentials(response, session, secureCookie, nativeClient);
      response.json({ data: credentialsResponse(session, current, nativeClient) });
    }),
  );

  router.post(
    '/logout',
    requireAuth(db, sessionSecret),
    asyncRoute(async (request, response) => {
      await db.delete(sessions).where(eq(sessions.id, request.auth!.sessionId));
      clearAuthCookies(response, secureCookie);
      response.status(204).end();
    }),
  );

  router.get(
    '/me',
    requireAuth(db, sessionSecret),
    asyncRoute(async (request, response) => {
      const [user] = await db
        .select({ id: users.id, email: users.email, role: users.role, emailVerifiedAt: users.emailVerifiedAt })
        .from(users)
        .where(and(eq(users.id, request.auth!.id), eq(users.isActive, true)))
        .limit(1);
      if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
      response.json({ data: { user } });
    }),
  );

  return router;
}

type SessionCredentials = {
  id: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  accessToken: string;
  accessExpiresAt: number;
};

async function issueSession(db: Database, user: AuthUser, secret: string): Promise<SessionCredentials> {
  const refreshToken = createSessionToken();
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  const [session] = await db
    .insert(sessions)
    .values({
      id: randomUUID(),
      userId: user.id,
      tokenHash: hashSessionToken(refreshToken, secret),
      expiresAt: refreshExpiresAt,
    })
    .returning({ id: sessions.id });
  if (!session) throw new Error('Session creation did not return a session.');
  return issueAccessCredential(user, session.id, refreshToken, secret, refreshExpiresAt);
}

function issueAccessCredential(
  user: Pick<AuthUser, 'id' | 'role'>,
  sessionId: string,
  refreshToken: string,
  secret: string,
  refreshExpiresAt: Date,
): SessionCredentials {
  const access = createAccessToken(user, sessionId, secret);
  return {
    id: sessionId,
    refreshToken,
    refreshExpiresAt,
    accessToken: access.token,
    accessExpiresAt: access.expiresAt,
  };
}

function sendCredentials(
  response: Response,
  session: SessionCredentials,
  secure: boolean,
  nativeClient: boolean,
) {
  if (nativeClient) return;
  const options = {
    httpOnly: true,
    secure,
    sameSite: secure ? 'none' as const : 'lax' as const,
    path: '/',
  };
  response.cookie(ACCESS_COOKIE, session.accessToken, {
    ...options,
    maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000,
  });
  response.cookie(SESSION_COOKIE, session.refreshToken, {
    ...options,
    maxAge: session.refreshExpiresAt.getTime() - Date.now(),
  });
}

function credentialsResponse(session: SessionCredentials, user: AuthUser, nativeClient: boolean) {
  return {
    user,
    accessExpiresAt: session.accessExpiresAt,
    ...(nativeClient ? { accessToken: session.accessToken, refreshToken: session.refreshToken } : {}),
  };
}

function clearAuthCookies(response: Response, secure: boolean) {
  const options = {
    httpOnly: true,
    secure,
    sameSite: secure ? 'none' as const : 'lax' as const,
    path: '/',
  };
  response.clearCookie(ACCESS_COOKIE, options);
  response.clearCookie(SESSION_COOKIE, options);
}

function isNativeClient(request: import('express').Request) {
  return request.get('x-agrimarket-client') === 'native';
}
