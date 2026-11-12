import { and, desc, eq, like, lt, sql } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';

import type { Database } from '../db/client.js';
import { auditLogs, businesses, listingImages, listings, users, verificationSubmissions } from '../db/schema.js';
import { HttpError, asyncRoute } from '../http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import type { PrivateStorage } from '../storage.js';
import { listingModerationSchema, verificationDecisionSchema } from '../validation.js';

const queueQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});

// Audit log filters: an action prefix (e.g. "verification." or "listing.published"),
// an exact target type, and a "before" timestamp for loading older pages.
const auditQuerySchema = z.object({
  action: z.string().trim().min(1).max(60).regex(/^[a-z_.]+$/).optional(),
  targetType: z.string().trim().min(1).max(40).regex(/^[a-z_]+$/).optional(),
  before: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export function createAdminRouter(db: Database, storage: PrivateStorage, sessionSecret: string): Router {
  const router = Router();
  router.use(requireAuth(db, sessionSecret), requireRole('admin'));

  router.get(
    '/verifications',
    asyncRoute(async (request, response) => {
      const query = queueQuerySchema.parse(request.query);
      const conditions = query.status ? [eq(verificationSubmissions.status, query.status)] : [];
      const rows = await db
        .select({
          id: verificationSubmissions.id,
          status: verificationSubmissions.status,
          submittedAt: verificationSubmissions.submittedAt,
          reviewedAt: verificationSubmissions.reviewedAt,
          sellerFeedback: verificationSubmissions.sellerFeedback,
          internalReason: verificationSubmissions.internalReason,
          documentCount: sql<number>`cardinality(${verificationSubmissions.storageKeys})`,
          businessId: businesses.id,
          businessName: businesses.name,
          province: businesses.province,
          ownerEmail: users.email,
        })
        .from(verificationSubmissions)
        .innerJoin(businesses, eq(verificationSubmissions.businessId, businesses.id))
        .innerJoin(users, eq(verificationSubmissions.submitterId, users.id))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(verificationSubmissions.submittedAt))
        .limit(query.limit);
      response.json({ data: rows });
    }),
  );

  router.post(
    '/verifications/:verificationId/decision',
    asyncRoute(async (request, response) => {
      const verificationId = z.uuid().parse(request.params.verificationId);
      const input = verificationDecisionSchema.parse(request.body);
      if (input.decision === 'rejected' && !input.sellerFeedback) {
        throw new HttpError(400, 'FEEDBACK_REQUIRED', 'Provide the seller with a safe reason for rejection.');
      }

      const result = await db.transaction(async (transaction) => {
        const [submission] = await transaction
          .select({ id: verificationSubmissions.id, businessId: verificationSubmissions.businessId })
          .from(verificationSubmissions)
          .where(and(eq(verificationSubmissions.id, verificationId), eq(verificationSubmissions.status, 'pending')))
          .limit(1)
          .for('update');
        if (!submission) throw new HttpError(409, 'DECISION_ALREADY_RECORDED', 'This verification submission is no longer pending.');

        const reviewedAt = new Date();
        const [updated] = await transaction
          .update(verificationSubmissions)
          .set({
            status: input.decision,
            reviewerId: request.auth!.id,
            reviewedAt,
            sellerFeedback: input.sellerFeedback,
            internalReason: input.internalReason,
          })
          .where(eq(verificationSubmissions.id, submission.id))
          .returning({ id: verificationSubmissions.id, status: verificationSubmissions.status, reviewedAt: verificationSubmissions.reviewedAt });

        await transaction
          .update(businesses)
          .set({ verificationStatus: input.decision, updatedAt: reviewedAt })
          .where(eq(businesses.id, submission.businessId));

        await transaction.insert(auditLogs).values({
          actorId: request.auth!.id,
          action: `verification.${input.decision}`,
          targetType: 'verification_submission',
          targetId: submission.id,
          metadata: { businessId: submission.businessId },
        });

        return updated;
      });
      response.json({ data: { submission: result } });
    }),
  );

  router.get(
    '/verifications/:verificationId/documents/:documentIndex',
    asyncRoute(async (request, response) => {
      const verificationId = z.uuid().parse(request.params.verificationId);
      const documentIndex = z.coerce.number().int().min(0).max(4).parse(request.params.documentIndex);
      const [submission] = await db
        .select({ id: verificationSubmissions.id, storageKeys: verificationSubmissions.storageKeys })
        .from(verificationSubmissions)
        .where(eq(verificationSubmissions.id, verificationId))
        .limit(1);
      const key = submission?.storageKeys[documentIndex];
      if (!submission || !key) throw new HttpError(404, 'DOCUMENT_NOT_FOUND', 'The requested document was not found.');
      const document = await storage.readPrivateObject(key);
      await db.insert(auditLogs).values({
        actorId: request.auth!.id,
        action: 'verification.document.read',
        targetType: 'verification_submission',
        targetId: submission.id,
        metadata: { documentIndex },
      });
      response.set({
        'Cache-Control': 'private, no-store',
        'Content-Type': document.mimeType,
        'Content-Disposition': 'attachment',
        'X-Content-Type-Options': 'nosniff',
      });
      response.send(document.buffer);
    }),
  );

  router.get(
    '/listings',
    asyncRoute(async (request, response) => {
      const query = queueQuerySchema.pick({ limit: true }).parse(request.query);
      const rows = await db
        .select({
          id: listings.id,
          title: listings.title,
          description: listings.description,
          town: listings.town,
          status: listings.status,
          createdAt: listings.createdAt,
          businessId: businesses.id,
          businessName: businesses.name,
          verificationStatus: businesses.verificationStatus,
          imageId: sql<string | null>`(select ${listingImages.id} from ${listingImages} where ${listingImages.listingId} = ${listings.id} order by ${listingImages.sortOrder} limit 1)`,
        })
        .from(listings)
        .innerJoin(businesses, eq(listings.businessId, businesses.id))
        .where(eq(listings.status, 'pending'))
        .orderBy(desc(listings.updatedAt))
        .limit(query.limit);
      response.json({
        data: rows.map(({ imageId, ...row }) => ({
          ...row,
          imageUrl: imageId ? `/api/v1/media/listings/${imageId}` : null,
        })),
      });
    }),
  );

  router.patch(
    '/listings/:listingId/moderation',
    asyncRoute(async (request, response) => {
      const listingId = z.uuid().parse(request.params.listingId);
      const input = listingModerationSchema.parse(request.body);
      const [target] = await db
        .select({ businessId: businesses.id, verificationStatus: businesses.verificationStatus })
        .from(listings)
        .innerJoin(businesses, eq(listings.businessId, businesses.id))
        .where(eq(listings.id, listingId))
        .limit(1);
      if (!target) throw new HttpError(404, 'NOT_FOUND', 'The listing was not found.');
      if (input.status === 'published' && target.verificationStatus !== 'approved') {
        throw new HttpError(409, 'BUSINESS_NOT_VERIFIED', 'Only listings for approved businesses can be published.');
      }

      const updated = await db.transaction(async (transaction) => {
        const [listing] = await transaction
          .update(listings)
          .set({ status: input.status, updatedAt: new Date() })
          .where(eq(listings.id, listingId))
          .returning({ id: listings.id, status: listings.status, updatedAt: listings.updatedAt });
        await transaction.insert(auditLogs).values({
          actorId: request.auth!.id,
          action: `listing.${input.status}`,
          targetType: 'listing',
          targetId: listingId,
          metadata: { businessId: target.businessId },
        });
        return listing;
      });
      response.json({ data: { listing: updated } });
    }),
  );

  router.get(
    '/overview',
    asyncRoute(async (_request, response) => {
      const count = sql<number>`count(*)::int`;
      const [verificationRows, businessRows, listingRows, userRows] = await Promise.all([
        db.select({ status: verificationSubmissions.status, count }).from(verificationSubmissions).groupBy(verificationSubmissions.status),
        db.select({ status: businesses.verificationStatus, count }).from(businesses).groupBy(businesses.verificationStatus),
        db.select({ status: listings.status, count }).from(listings).groupBy(listings.status),
        db.select({ role: users.role, count }).from(users).where(eq(users.isActive, true)).groupBy(users.role),
      ]);
      const toRecord = <K extends string>(rows: { key: K; count: number }[]) =>
        Object.fromEntries(rows.map((row) => [row.key, row.count])) as Partial<Record<K, number>>;
      response.json({
        data: {
          verifications: toRecord(verificationRows.map((row) => ({ key: row.status, count: row.count }))),
          businesses: toRecord(businessRows.map((row) => ({ key: row.status, count: row.count }))),
          listings: toRecord(listingRows.map((row) => ({ key: row.status, count: row.count }))),
          users: toRecord(userRows.map((row) => ({ key: row.role, count: row.count }))),
        },
      });
    }),
  );

  router.get(
    '/audit-logs',
    asyncRoute(async (request, response) => {
      const query = auditQuerySchema.parse(request.query);
      const conditions = [
        query.action ? like(auditLogs.action, `${query.action.replace(/[%_\\]/g, '\\$&')}%`) : undefined,
        query.targetType ? eq(auditLogs.targetType, query.targetType) : undefined,
        query.before ? lt(auditLogs.createdAt, query.before) : undefined,
      ].filter((condition) => condition !== undefined);
      const rows = await db
        .select({
          id: auditLogs.id,
          actorId: auditLogs.actorId,
          action: auditLogs.action,
          targetType: auditLogs.targetType,
          targetId: auditLogs.targetId,
          metadata: auditLogs.metadata,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(auditLogs.createdAt))
        .limit(query.limit);
      response.json({ data: rows });
    }),
  );

  return router;
}