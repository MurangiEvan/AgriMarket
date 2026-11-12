import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';

import type { Database } from '../db/client.js';
import { notifications } from '../db/schema.js';
import { HttpError, asyncRoute } from '../http.js';
import { requireAuth } from '../middleware/auth.js';

const listQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(30) });

// Every query is scoped to the signed-in user, so nobody can read or change another user's notifications.
export function createNotificationsRouter(db: Database, sessionSecret: string): Router {
  const router = Router();
  router.use(requireAuth(db, sessionSecret));

  router.get(
    '/',
    asyncRoute(async (request, response) => {
      const { limit } = listQuerySchema.parse(request.query);
      const userId = request.auth!.id;
      const [items, [unread]] = await Promise.all([
        db
          .select({
            id: notifications.id,
            type: notifications.type,
            title: notifications.title,
            body: notifications.body,
            link: notifications.link,
            readAt: notifications.readAt,
            createdAt: notifications.createdAt,
          })
          .from(notifications)
          .where(eq(notifications.userId, userId))
          .orderBy(desc(notifications.createdAt))
          .limit(limit),
        db.select({ value: count() }).from(notifications).where(and(eq(notifications.userId, userId), isNull(notifications.readAt))),
      ]);
      response.set('Cache-Control', 'private, no-store');
      response.json({ data: { items, unreadCount: unread?.value ?? 0 } });
    }),
  );

  // Cheap poll for the bell badge.
  router.get(
    '/unread-count',
    asyncRoute(async (request, response) => {
      const [unread] = await db
        .select({ value: count() })
        .from(notifications)
        .where(and(eq(notifications.userId, request.auth!.id), isNull(notifications.readAt)));
      response.set('Cache-Control', 'private, no-store');
      response.json({ data: { unreadCount: unread?.value ?? 0 } });
    }),
  );

  router.post(
    '/read-all',
    asyncRoute(async (request, response) => {
      await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(and(eq(notifications.userId, request.auth!.id), isNull(notifications.readAt)));
      response.status(204).end();
    }),
  );

  router.post(
    '/:notificationId/read',
    asyncRoute(async (request, response) => {
      const notificationId = z.uuid().parse(request.params.notificationId);
      const [owned] = await db
        .select({ id: notifications.id, readAt: notifications.readAt })
        .from(notifications)
        .where(and(eq(notifications.id, notificationId), eq(notifications.userId, request.auth!.id)))
        .limit(1);
      if (!owned) throw new HttpError(404, 'NOT_FOUND', 'The notification was not found.');
      if (!owned.readAt) {
        await db.update(notifications).set({ readAt: new Date() }).where(eq(notifications.id, owned.id));
      }
      response.status(204).end();
    }),
  );

  return router;
}
