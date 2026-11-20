import { and, desc, eq } from 'drizzle-orm';
import { Router } from 'express';

import type { Database } from '../db/client.js';
import { auditLogs, deletionRequests } from '../db/schema.js';
import { HttpError, asyncRoute } from '../http.js';
import { requireAuth } from '../middleware/auth.js';
import { deletionRequestSchema } from '../validation.js';

// A user's own account settings. Deleting an account is a request that an administrator approves,
// so open fraud reports or disputes can be checked first (POPIA still requires it without undue delay).
export function createAccountRouter(db: Database, sessionSecret: string): Router {
  const router = Router();
  router.use(requireAuth(db, sessionSecret));

  const latestRequest = (userId: string) =>
    db
      .select({
        id: deletionRequests.id,
        status: deletionRequests.status,
        reason: deletionRequests.reason,
        decisionNote: deletionRequests.decisionNote,
        createdAt: deletionRequests.createdAt,
        reviewedAt: deletionRequests.reviewedAt,
      })
      .from(deletionRequests)
      .where(eq(deletionRequests.userId, userId))
      .orderBy(desc(deletionRequests.createdAt))
      .limit(1);

  router.get(
    '/deletion-request',
    asyncRoute(async (request, response) => {
      const [latest] = await latestRequest(request.auth!.id);
      response.set('Cache-Control', 'private, no-store');
      response.json({ data: { request: latest ?? null } });
    }),
  );

  router.post(
    '/deletion-request',
    asyncRoute(async (request, response) => {
      if (request.auth!.role === 'admin') {
        throw new HttpError(403, 'ADMIN_ACCOUNT', 'Administrator accounts are removed by another administrator, not through this form.');
      }
      const input = deletionRequestSchema.parse(request.body ?? {});
      const userId = request.auth!.id;
      const [pending] = await db
        .select({ id: deletionRequests.id })
        .from(deletionRequests)
        .where(and(eq(deletionRequests.userId, userId), eq(deletionRequests.status, 'pending')))
        .limit(1);
      if (pending) throw new HttpError(409, 'DELETION_ALREADY_REQUESTED', 'You have already asked for your account to be deleted. An administrator will review it.');

      await db.transaction(async (transaction) => {
        const [created] = await transaction
          .insert(deletionRequests)
          .values({ userId, reason: input.reason })
          .returning({ id: deletionRequests.id });
        await transaction.insert(auditLogs).values({
          actorId: userId,
          action: 'user.deletion_requested',
          targetType: 'user',
          targetId: userId,
          metadata: { requestId: created!.id },
        });
      });
      const [latest] = await latestRequest(userId);
      response.status(201).json({ data: { request: latest } });
    }),
  );

  router.delete(
    '/deletion-request',
    asyncRoute(async (request, response) => {
      const userId = request.auth!.id;
      const [cancelled] = await db
        .update(deletionRequests)
        .set({ status: 'cancelled', reviewedAt: new Date() })
        .where(and(eq(deletionRequests.userId, userId), eq(deletionRequests.status, 'pending')))
        .returning({ id: deletionRequests.id });
      if (!cancelled) throw new HttpError(404, 'NOT_FOUND', 'There is no pending deletion request to cancel.');
      await db.insert(auditLogs).values({
        actorId: userId,
        action: 'user.deletion_cancelled',
        targetType: 'user',
        targetId: userId,
        metadata: { requestId: cancelled.id },
      });
      response.json({ data: { request: null } });
    }),
  );

  return router;
}
