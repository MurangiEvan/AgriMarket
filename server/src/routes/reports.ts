import { and, eq } from 'drizzle-orm';
import { Router } from 'express';

import type { Database } from '../db/client.js';
import { businesses, listings, ratings, reports } from '../db/schema.js';
import { HttpError, asyncRoute } from '../http.js';
import { requireAuth } from '../middleware/auth.js';
import { assertListingReportable, assertRatingReportable } from '../policies.js';
import { reportCreateSchema } from '../validation.js';

// Any signed-in user can report something that looks like a scam or is wrong. An administrator
// reviews every report on the admin website; the reported seller never learns who reported them.
export function createReportsRouter(db: Database, sessionSecret: string): Router {
  const router = Router();
  router.use(requireAuth(db, sessionSecret));

  router.post(
    '/',
    asyncRoute(async (request, response) => {
      const input = reportCreateSchema.parse(request.body);
      const reporterId = request.auth!.id;

      if (input.targetType === 'listing') {
        const [listing] = await db
          .select({ status: listings.status, verificationStatus: businesses.verificationStatus, ownerId: businesses.ownerId })
          .from(listings)
          .innerJoin(businesses, eq(listings.businessId, businesses.id))
          .where(eq(listings.id, input.targetId))
          .limit(1);
        assertListingReportable(listing, reporterId);
      } else {
        const [rating] = await db
          .select({ hidden: ratings.hidden, buyerId: ratings.buyerId })
          .from(ratings)
          .where(eq(ratings.id, input.targetId))
          .limit(1);
        assertRatingReportable(rating, reporterId);
      }

      const [existing] = await db
        .select({ id: reports.id })
        .from(reports)
        .where(and(
          eq(reports.reporterId, reporterId),
          eq(reports.targetType, input.targetType),
          eq(reports.targetId, input.targetId),
          eq(reports.status, 'open'),
        ))
        .limit(1);
      if (existing) {
        throw new HttpError(409, 'ALREADY_REPORTED', 'You have already reported this. An administrator will review it.');
      }

      const [created] = await db
        .insert(reports)
        .values({ reporterId, targetType: input.targetType, targetId: input.targetId, reason: input.reason, details: input.details })
        .returning({ id: reports.id, status: reports.status, createdAt: reports.createdAt });
      response.status(201).json({ data: { report: created } });
    }),
  );

  return router;
}
