import { and, desc, eq, inArray, isNotNull, like, lt, ne, or, sql } from 'drizzle-orm';
import { Router, type Response } from 'express';
import { z } from 'zod';

import type { Database } from '../db/client.js';
import { anonymiseAccount } from '../account-deletion.js';
import { auditLogs, businesses, categories, deletionRequests, enquiries, listingImages, listings, ratings, reports, users, verificationSubmissions } from '../db/schema.js';
import { toCsv } from '../csv.js';
import { HttpError, asyncRoute } from '../http.js';
import type { Mailer } from '../mailer.js';
import { DRONE_CATEGORY_SLUG, isDroneCategory } from '../offerings.js';
import { dealValueLabel, outcomeLabel } from '../outcomes.js';
import { assertDroneLicenceConfirmed, assertDroneLicenceOnFile } from '../policies.js';
import { deletionRejectedNotification, listingNotification, listingTakenDownNotification, notify, verificationNotification } from '../notifications.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import type { PrivateStorage, PublicImageStorage } from '../storage.js';
import {
  deletionDecisionSchema,
  deletionListQuerySchema,
  listingModerationSchema,
  ratingCommentDecisionSchema,
  ratingModerationQuerySchema,
  reportDecisionSchema,
  reportListQuerySchema,
  verificationDecisionSchema,
} from '../validation.js';

export type AdminRouterOptions = { imageStorage?: PublicImageStorage; mailer?: Mailer };

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

export function createAdminRouter(db: Database, storage: PrivateStorage, sessionSecret: string, options: AdminRouterOptions = {}): Router {
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
          agrisetaSupportClaimed: businesses.agrisetaSupportClaimed,
          agrisetaReference: businesses.agrisetaReference,
          agrisetaSupported: businesses.agrisetaSupported,
          sacaaRplNumber: businesses.sacaaRplNumber,
          sacaaRocNumber: businesses.sacaaRocNumber,
          droneLicenceVerified: businesses.droneLicenceVerified,
        })
        .from(verificationSubmissions)
        .innerJoin(businesses, eq(verificationSubmissions.businessId, businesses.id))
        .innerJoin(users, eq(verificationSubmissions.submitterId, users.id))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(verificationSubmissions.submittedAt))
        .limit(query.limit);

      // The produce photos that came with each application, so the admin reviews it as a whole.
      const businessIds = [...new Set(rows.map((row) => row.businessId))];
      const photoRows = businessIds.length
        ? await db
            .select({
              businessId: listings.businessId,
              listingId: listings.id,
              title: listings.title,
              description: listings.description,
              status: listings.status,
              categorySlug: categories.slug,
              imageId: sql<string | null>`(select ${listingImages.id} from ${listingImages} where ${listingImages.listingId} = ${listings.id} order by ${listingImages.sortOrder} limit 1)`,
            })
            .from(listings)
            .innerJoin(categories, eq(listings.categoryId, categories.id))
            .where(and(inArray(listings.businessId, businessIds), inArray(listings.status, ['pending', 'published', 'rejected'])))
            .orderBy(desc(listings.createdAt))
        : [];
      const photosByBusiness = new Map<string, Array<{ listingId: string; title: string; description: string; status: string; categorySlug: string; imageUrl: string | null }>>();
      for (const { businessId, imageId, ...photo } of photoRows) {
        const list = photosByBusiness.get(businessId) ?? [];
        if (list.length < 5) list.push({ ...photo, imageUrl: imageId ? `/api/v1/media/listings/${imageId}` : null });
        photosByBusiness.set(businessId, list);
      }
      response.json({
        data: rows.map((row) => {
          const photos = photosByBusiness.get(row.businessId) ?? [];
          // Drone applications need the admin to check the SACAA licence before approving.
          return { ...row, photos, offersDroneServices: photos.some((photo) => isDroneCategory(photo.categorySlug)) };
        }),
      });
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
          .select({
            id: verificationSubmissions.id,
            businessId: verificationSubmissions.businessId,
            businessName: businesses.name,
            ownerId: businesses.ownerId,
            agrisetaSupportClaimed: businesses.agrisetaSupportClaimed,
            droneLicenceVerified: businesses.droneLicenceVerified,
            sacaaRplNumber: businesses.sacaaRplNumber,
            sacaaRocNumber: businesses.sacaaRocNumber,
          })
          .from(verificationSubmissions)
          .innerJoin(businesses, eq(verificationSubmissions.businessId, businesses.id))
          .where(and(eq(verificationSubmissions.id, verificationId), eq(verificationSubmissions.status, 'pending')))
          .limit(1)
          .for('update', { of: verificationSubmissions });
        if (!submission) throw new HttpError(409, 'DECISION_ALREADY_RECORDED', 'This verification submission is no longer pending.');

        // Approving publishes the application's listings, so a drone offering needs the licence checked.
        const pendingDrone = input.decision === 'approved'
          ? await transaction
              .select({ id: listings.id })
              .from(listings)
              .innerJoin(categories, eq(listings.categoryId, categories.id))
              .where(and(eq(listings.businessId, submission.businessId), eq(listings.status, 'pending'), eq(categories.slug, DRONE_CATEGORY_SLUG)))
              .limit(1)
          : [];
        const confirmingDrone = pendingDrone.length > 0;
        if (confirmingDrone) {
          assertDroneLicenceOnFile(submission);
          assertDroneLicenceConfirmed(true, submission.droneLicenceVerified, input.confirmDroneLicence);
        }

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

        // The AgriSETA badge is only shown when the seller claimed support and the admin confirmed it.
        await transaction
          .update(businesses)
          .set({
            verificationStatus: input.decision,
            agrisetaSupported: input.decision === 'approved' && input.confirmAgriseta && submission.agrisetaSupportClaimed,
            ...(confirmingDrone ? { droneLicenceVerified: true } : {}),
            updatedAt: reviewedAt,
          })
          .where(eq(businesses.id, submission.businessId));

        await transaction.insert(auditLogs).values({
          actorId: request.auth!.id,
          action: `verification.${input.decision}`,
          targetType: 'verification_submission',
          targetId: submission.id,
          metadata: { businessId: submission.businessId, droneLicenceConfirmed: confirmingDrone },
        });

        // The produce photo arrived inside the application and was reviewed with it: approving the
        // application publishes it, rejecting the application rejects it (the seller resubmits both).
        const applicationListings = await transaction
          .update(listings)
          .set({ status: input.decision === 'approved' ? 'published' : 'rejected', updatedAt: reviewedAt })
          .where(and(eq(listings.businessId, submission.businessId), eq(listings.status, 'pending')))
          .returning({ id: listings.id });
        if (applicationListings.length) {
          await transaction.insert(auditLogs).values(applicationListings.map((listing) => ({
            actorId: request.auth!.id,
            action: `listing.${input.decision === 'approved' ? 'published' : 'rejected'}`,
            targetType: 'listing',
            targetId: listing.id,
            metadata: { businessId: submission.businessId, viaApplication: true },
          })));
        }

        await notify(transaction, verificationNotification(submission.ownerId, submission.businessName, input.decision, input.sellerFeedback ?? null));

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
          categorySlug: categories.slug,
          sacaaRplNumber: businesses.sacaaRplNumber,
          sacaaRocNumber: businesses.sacaaRocNumber,
          droneLicenceVerified: businesses.droneLicenceVerified,
          imageId: sql<string | null>`(select ${listingImages.id} from ${listingImages} where ${listingImages.listingId} = ${listings.id} order by ${listingImages.sortOrder} limit 1)`,
        })
        .from(listings)
        .innerJoin(businesses, eq(listings.businessId, businesses.id))
        .innerJoin(categories, eq(listings.categoryId, categories.id))
        // Photos from businesses still under review are part of their application (Verifications).
        .where(and(eq(listings.status, 'pending'), eq(businesses.verificationStatus, 'approved')))
        .orderBy(desc(listings.updatedAt))
        .limit(query.limit);
      response.json({
        data: rows.map(({ imageId, categorySlug, ...row }) => ({
          ...row,
          isDroneService: isDroneCategory(categorySlug),
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
        .select({
          businessId: businesses.id,
          verificationStatus: businesses.verificationStatus,
          ownerId: businesses.ownerId,
          title: listings.title,
          categorySlug: categories.slug,
          droneLicenceVerified: businesses.droneLicenceVerified,
          sacaaRplNumber: businesses.sacaaRplNumber,
          sacaaRocNumber: businesses.sacaaRocNumber,
        })
        .from(listings)
        .innerJoin(businesses, eq(listings.businessId, businesses.id))
        .innerJoin(categories, eq(listings.categoryId, categories.id))
        .where(eq(listings.id, listingId))
        .limit(1);
      if (!target) throw new HttpError(404, 'NOT_FOUND', 'The listing was not found.');
      if (input.status === 'published' && target.verificationStatus !== 'approved') {
        throw new HttpError(409, 'BUSINESS_NOT_VERIFIED', 'Only listings for approved businesses can be published.');
      }
      const droneListing = input.status === 'published' && isDroneCategory(target.categorySlug);
      if (droneListing) {
        assertDroneLicenceOnFile(target);
        assertDroneLicenceConfirmed(true, target.droneLicenceVerified, input.confirmDroneLicence);
      }

      const updated = await db.transaction(async (transaction) => {
        if (droneListing && input.confirmDroneLicence && !target.droneLicenceVerified) {
          await transaction.update(businesses).set({ droneLicenceVerified: true, updatedAt: new Date() }).where(eq(businesses.id, target.businessId));
          await transaction.insert(auditLogs).values({
            actorId: request.auth!.id,
            action: 'business.drone_licence_confirmed',
            targetType: 'business',
            targetId: target.businessId,
            metadata: { listingId },
          });
        }
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
        const notification = listingNotification(target.ownerId, target.title, input.status, input.reason);
        if (notification) await notify(transaction, notification);
        return listing;
      });
      response.json({ data: { listing: updated } });
    }),
  );

  // Reports from buyers and sellers about listings that look like scams or are wrong.
  router.get(
    '/reports',
    asyncRoute(async (request, response) => {
      const { status } = reportListQuerySchema.parse(request.query);
      const rows = await db
        .select({
          id: reports.id,
          targetType: reports.targetType,
          targetId: reports.targetId,
          reason: reports.reason,
          details: reports.details,
          status: reports.status,
          createdAt: reports.createdAt,
          reviewedAt: reports.reviewedAt,
          resolutionNote: reports.resolutionNote,
          reporterEmail: users.email,
          reporterRole: users.role,
        })
        .from(reports)
        .innerJoin(users, eq(reports.reporterId, users.id))
        .where(eq(reports.status, status))
        .orderBy(status === 'open' ? reports.createdAt : desc(reports.reviewedAt))
        .limit(100);
      const listingIds = [...new Set(rows.filter((row) => row.targetType === 'listing').map((row) => row.targetId))];
      const [targets, openCounts] = listingIds.length
        ? await Promise.all([
            db
              .select({
                id: listings.id,
                title: listings.title,
                description: listings.description,
                status: listings.status,
                businessId: businesses.id,
                businessName: businesses.name,
                town: businesses.town,
                province: businesses.province,
              })
              .from(listings)
              .innerJoin(businesses, eq(listings.businessId, businesses.id))
              .where(inArray(listings.id, listingIds)),
            db
              .select({ targetId: reports.targetId, count: sql<number>`count(*)::int` })
              .from(reports)
              .where(and(eq(reports.status, 'open'), inArray(reports.targetId, listingIds)))
              .groupBy(reports.targetId),
          ])
        : [[], []];
      const ratingIds = [...new Set(rows.filter((row) => row.targetType === 'rating').map((row) => row.targetId))];
      const ratingTargets = ratingIds.length
        ? await db
            .select({
              id: ratings.id,
              stars: ratings.stars,
              comment: ratings.comment,
              hidden: ratings.hidden,
              businessName: businesses.name,
              createdAt: ratings.createdAt,
            })
            .from(ratings)
            .innerJoin(businesses, eq(ratings.businessId, businesses.id))
            .where(inArray(ratings.id, ratingIds))
        : [];
      const targetById = new Map(targets.map((target) => [target.id, target]));
      const ratingById = new Map(ratingTargets.map((target) => [target.id, target]));
      const countById = new Map(openCounts.map((row) => [row.targetId, row.count]));
      response.set('Cache-Control', 'private, no-store');
      response.json({
        data: rows.map((row) => ({
          ...row,
          listing: row.targetType === 'listing' ? targetById.get(row.targetId) ?? null : null,
          rating: row.targetType === 'rating' ? ratingById.get(row.targetId) ?? null : null,
          openReportsOnTarget: countById.get(row.targetId) ?? 0,
        })),
      });
    }),
  );

  router.post(
    '/reports/:reportId/decision',
    asyncRoute(async (request, response) => {
      const reportId = z.uuid().parse(request.params.reportId);
      const input = reportDecisionSchema.parse(request.body);
      const [report] = await db.select().from(reports).where(eq(reports.id, reportId)).limit(1);
      if (!report) throw new HttpError(404, 'NOT_FOUND', 'The report was not found.');
      if (report.status !== 'open') throw new HttpError(409, 'ALREADY_REVIEWED', 'This report has already been reviewed.');
      const now = new Date();
      const review = { reviewedBy: request.auth!.id, reviewedAt: now, resolutionNote: input.note || null };

      if (input.action === 'dismiss') {
        await db.transaction(async (transaction) => {
          await transaction.update(reports).set({ status: 'dismissed', ...review }).where(eq(reports.id, reportId));
          await transaction.insert(auditLogs).values({
            actorId: request.auth!.id,
            action: 'report.dismissed',
            targetType: 'report',
            targetId: reportId,
            metadata: { reportedType: report.targetType, reportedId: report.targetId, reason: report.reason },
          });
        });
        response.json({ data: { status: 'dismissed' } });
        return;
      }

      if (report.targetType === 'rating') {
        // Hiding a rating removes its stars from the average and its comment from the listing page.
        await db.transaction(async (transaction) => {
          await transaction.update(ratings).set({ hidden: true, commentStatus: 'hidden', updatedAt: now }).where(eq(ratings.id, report.targetId));
          await transaction
            .update(reports)
            .set({ status: 'actioned', ...review })
            .where(and(eq(reports.targetType, 'rating'), eq(reports.targetId, report.targetId), eq(reports.status, 'open')));
          await transaction.insert(auditLogs).values({
            actorId: request.auth!.id,
            action: 'report.actioned',
            targetType: 'rating',
            targetId: report.targetId,
            metadata: { reportId, reason: report.reason },
          });
        });
        response.json({ data: { status: 'actioned' } });
        return;
      }
      const [target] = await db
        .select({ title: listings.title, ownerId: businesses.ownerId, businessId: businesses.id })
        .from(listings)
        .innerJoin(businesses, eq(listings.businessId, businesses.id))
        .where(eq(listings.id, report.targetId))
        .limit(1);
      if (!target) throw new HttpError(404, 'NOT_FOUND', 'The reported listing no longer exists.');

      // Taking the listing down settles every open report about it, not just this one.
      await db.transaction(async (transaction) => {
        await transaction.update(listings).set({ status: 'archived', updatedAt: now }).where(eq(listings.id, report.targetId));
        await transaction
          .update(reports)
          .set({ status: 'actioned', ...review })
          .where(and(eq(reports.targetType, 'listing'), eq(reports.targetId, report.targetId), eq(reports.status, 'open')));
        await transaction.insert(auditLogs).values({
          actorId: request.auth!.id,
          action: 'report.actioned',
          targetType: 'listing',
          targetId: report.targetId,
          metadata: { reportId, reason: report.reason, businessId: target.businessId },
        });
        await notify(transaction, listingTakenDownNotification(target.ownerId, target.title, input.note));
      });
      response.json({ data: { status: 'actioned' } });
    }),
  );

  // Rating comments wait here before they appear on listing pages. Stars count straight away.
  router.get(
    '/ratings',
    asyncRoute(async (request, response) => {
      const { commentStatus } = ratingModerationQuerySchema.parse(request.query);
      const rows = await db
        .select({
          id: ratings.id,
          stars: ratings.stars,
          comment: ratings.comment,
          commentStatus: ratings.commentStatus,
          hidden: ratings.hidden,
          createdAt: ratings.createdAt,
          updatedAt: ratings.updatedAt,
          businessName: businesses.name,
          buyerEmail: users.email,
          buyerType: users.organisationType,
        })
        .from(ratings)
        .innerJoin(businesses, eq(ratings.businessId, businesses.id))
        .innerJoin(users, eq(ratings.buyerId, users.id))
        .where(eq(ratings.commentStatus, commentStatus))
        .orderBy(commentStatus === 'pending' ? ratings.updatedAt : desc(ratings.updatedAt))
        .limit(100);
      response.set('Cache-Control', 'private, no-store');
      response.json({ data: rows });
    }),
  );

  router.post(
    '/ratings/:ratingId/comment',
    asyncRoute(async (request, response) => {
      const ratingId = z.uuid().parse(request.params.ratingId);
      const { action } = ratingCommentDecisionSchema.parse(request.body);
      const [rating] = await db.select({ comment: ratings.comment, hidden: ratings.hidden }).from(ratings).where(eq(ratings.id, ratingId)).limit(1);
      if (!rating) throw new HttpError(404, 'NOT_FOUND', 'The rating was not found.');
      if (!rating.comment) throw new HttpError(409, 'NO_COMMENT', 'This rating has no comment to review.');
      if (rating.hidden && action === 'approve') throw new HttpError(409, 'RATING_HIDDEN', 'This rating was hidden after a report and cannot be shown.');
      const commentStatus = action === 'approve' ? 'approved' : 'hidden';
      await db.transaction(async (transaction) => {
        await transaction.update(ratings).set({ commentStatus, updatedAt: new Date() }).where(eq(ratings.id, ratingId));
        await transaction.insert(auditLogs).values({
          actorId: request.auth!.id,
          action: action === 'approve' ? 'rating.comment_approved' : 'rating.comment_hidden',
          targetType: 'rating',
          targetId: ratingId,
          metadata: {},
        });
      });
      response.json({ data: { commentStatus } });
    }),
  );

  // Deletion requests: the admin checks for open reports or disputes, then approves (anonymises
  // the account) or rejects with a reason the user can read.
  router.get(
    '/deletion-requests',
    asyncRoute(async (request, response) => {
      const { status } = deletionListQuerySchema.parse(request.query);
      const rows = await db
        .select({
          id: deletionRequests.id,
          userId: deletionRequests.userId,
          reason: deletionRequests.reason,
          status: deletionRequests.status,
          decisionNote: deletionRequests.decisionNote,
          createdAt: deletionRequests.createdAt,
          reviewedAt: deletionRequests.reviewedAt,
          email: users.email,
          role: users.role,
          memberSince: users.createdAt,
        })
        .from(deletionRequests)
        .innerJoin(users, eq(deletionRequests.userId, users.id))
        .where(eq(deletionRequests.status, status))
        .orderBy(status === 'pending' ? deletionRequests.createdAt : desc(deletionRequests.reviewedAt))
        .limit(100);
      const userIds = rows.map((row) => row.userId);
      const [ownedBusinesses, reportCounts] = userIds.length
        ? await Promise.all([
            db
              .select({ ownerId: businesses.ownerId, name: businesses.name, verificationStatus: businesses.verificationStatus })
              .from(businesses)
              .where(inArray(businesses.ownerId, userIds)),
            // Open reports against this user's listings: a reason to look closer before approving.
            db
              .select({ ownerId: businesses.ownerId, count: sql<number>`count(*)::int` })
              .from(reports)
              .innerJoin(listings, and(eq(reports.targetType, 'listing'), eq(reports.targetId, listings.id)))
              .innerJoin(businesses, eq(listings.businessId, businesses.id))
              .where(and(eq(reports.status, 'open'), inArray(businesses.ownerId, userIds)))
              .groupBy(businesses.ownerId),
          ])
        : [[], []];
      const businessByOwner = new Map(ownedBusinesses.map((business) => [business.ownerId, business]));
      const reportsByOwner = new Map(reportCounts.map((row) => [row.ownerId, row.count]));
      response.set('Cache-Control', 'private, no-store');
      response.json({
        data: rows.map((row) => ({
          ...row,
          business: businessByOwner.get(row.userId) ?? null,
          openReportsAgainstUser: reportsByOwner.get(row.userId) ?? 0,
        })),
      });
    }),
  );

  router.post(
    '/deletion-requests/:requestId/decision',
    asyncRoute(async (request, response) => {
      const requestId = z.uuid().parse(request.params.requestId);
      const input = deletionDecisionSchema.parse(request.body);
      const [deletion] = await db.select().from(deletionRequests).where(eq(deletionRequests.id, requestId)).limit(1);
      if (!deletion) throw new HttpError(404, 'NOT_FOUND', 'The deletion request was not found.');
      if (deletion.status !== 'pending') throw new HttpError(409, 'ALREADY_REVIEWED', 'This request has already been reviewed or was cancelled.');
      const review = { reviewedBy: request.auth!.id, reviewedAt: new Date(), decisionNote: input.note || null };

      if (input.decision === 'rejected') {
        await db.transaction(async (transaction) => {
          await transaction.update(deletionRequests).set({ status: 'rejected', ...review }).where(eq(deletionRequests.id, requestId));
          await transaction.insert(auditLogs).values({
            actorId: request.auth!.id,
            action: 'user.deletion_rejected',
            targetType: 'user',
            targetId: deletion.userId,
            metadata: { requestId },
          });
          await notify(transaction, deletionRejectedNotification(deletion.userId, input.note));
        });
        response.json({ data: { status: 'rejected' } });
        return;
      }

      const removed = await db.transaction(async (transaction) => {
        await transaction.update(deletionRequests).set({ status: 'approved', ...review }).where(eq(deletionRequests.id, requestId));
        const result = await anonymiseAccount(transaction, deletion.userId);
        await transaction.insert(auditLogs).values({
          actorId: request.auth!.id,
          action: 'user.deleted',
          targetType: 'user',
          targetId: deletion.userId,
          metadata: { requestId, documentsRemoved: result.documentKeys.length, photosRemoved: result.imageKeys.length },
        });
        return result;
      });

      // Files and the confirmation email come after the commit; a failure here never undoes the deletion.
      await Promise.allSettled([
        ...removed.documentKeys.map((key) => storage.removePrivateObject(key)),
        ...removed.imageKeys.map((key) => options.imageStorage?.removePublicImage(key)),
      ]);
      await options.mailer?.sendAccountDeleted(removed.originalEmail).catch(() => {
        console.error('Account deleted confirmation email could not be sent');
      });
      response.json({ data: { status: 'approved' } });
    }),
  );

  router.get(
    '/overview',
    asyncRoute(async (_request, response) => {
      const count = sql<number>`count(*)::int`;
      const [verificationRows, businessRows, listingRows, userRows] = await Promise.all([
        db.select({ status: verificationSubmissions.status, count }).from(verificationSubmissions).groupBy(verificationSubmissions.status),
        db.select({ status: businesses.verificationStatus, count }).from(businesses).groupBy(businesses.verificationStatus),
        // Pending photos inside an application are counted with the application, not as photos waiting.
        db
          .select({ status: listings.status, count })
          .from(listings)
          .innerJoin(businesses, eq(listings.businessId, businesses.id))
          .where(or(ne(listings.status, 'pending'), eq(businesses.verificationStatus, 'approved')))
          .groupBy(listings.status),
        db.select({ role: users.role, count }).from(users).where(eq(users.isActive, true)).groupBy(users.role),
      ]);
      const [ratingRows, pendingCommentRows] = await Promise.all([
        db
          .select({ total: count, satisfied: sql<number>`count(*) filter (where ${ratings.stars} >= 4)::int` })
          .from(ratings)
          .where(eq(ratings.hidden, false)),
        db.select({ count }).from(ratings).where(eq(ratings.commentStatus, 'pending')),
      ]);
      const ratingTotal = ratingRows[0]?.total ?? 0;
      const [outcomeRows, valueBandRows] = await Promise.all([
        db.select({ outcome: enquiries.outcome, count }).from(enquiries).where(isNotNull(enquiries.outcome)).groupBy(enquiries.outcome),
        db
          .select({ band: enquiries.outcomeValueBand, count })
          .from(enquiries)
          .where(eq(enquiries.outcome, 'deal_made'))
          .groupBy(enquiries.outcomeValueBand),
      ]);
      const dealsMade = outcomeRows.find((row) => row.outcome === 'deal_made')?.count ?? 0;
      const outcomesRecorded = outcomeRows.reduce((total, row) => total + row.count, 0);
      const [buyerTypeRows, agrisetaRows, openReportRows, pendingDeletionRows] = await Promise.all([
        db
          .select({ type: users.organisationType, count })
          .from(users)
          // Buyers, plus sellers who also buy (they set an organisation before enquiring).
          .where(and(eq(users.isActive, true), or(eq(users.role, 'buyer'), and(eq(users.role, 'seller'), isNotNull(users.organisationType)))))
          .groupBy(users.organisationType),
        db.select({ count }).from(businesses).where(and(eq(businesses.verificationStatus, 'approved'), eq(businesses.agrisetaSupported, true))),
        db.select({ count }).from(reports).where(eq(reports.status, 'open')),
        db.select({ count }).from(deletionRequests).where(eq(deletionRequests.status, 'pending')),
      ]);
      const toRecord = <K extends string>(rows: { key: K; count: number }[]) =>
        Object.fromEntries(rows.map((row) => [row.key, row.count])) as Partial<Record<K, number>>;
      response.json({
        data: {
          verifications: toRecord(verificationRows.map((row) => ({ key: row.status, count: row.count }))),
          businesses: toRecord(businessRows.map((row) => ({ key: row.status, count: row.count }))),
          listings: toRecord(listingRows.map((row) => ({ key: row.status, count: row.count }))),
          users: toRecord(userRows.map((row) => ({ key: row.role, count: row.count }))),
          // Buyers who have not said who they buy for yet are counted as "not_set".
          buyerTypes: toRecord(buyerTypeRows.map((row) => ({ key: row.type ?? 'not_set', count: row.count }))),
          agrisetaSupportedBusinesses: agrisetaRows[0]?.count ?? 0,
          openReports: openReportRows[0]?.count ?? 0,
          pendingDeletionRequests: pendingDeletionRows[0]?.count ?? 0,
          // Handbook KPI: share of visible ratings with 4 or 5 stars (target above 85%).
          ratings: {
            total: ratingTotal,
            satisfactionScore: ratingTotal ? Math.round(((ratingRows[0]?.satisfied ?? 0) / ratingTotal) * 100) : null,
            pendingComments: pendingCommentRows[0]?.count ?? 0,
          },
          // Outcomes sellers recorded when closing enquiries. dealRate is null until any are recorded.
          deals: {
            made: dealsMade,
            outcomesRecorded,
            dealRate: outcomesRecorded ? Math.round((dealsMade / outcomesRecorded) * 100) : null,
            valueBands: toRecord(valueBandRows.map((row) => ({ key: row.band ?? 'not_given', count: row.count }))),
          },
        },
      });
    }),
  );

  // CSV exports for linkage partners (CRM, AgriSMME, enterprise-development and procurement
  // programmes). Each download is audited because it takes business data out of AgriMarket.
  router.get(
    '/exports/businesses.csv',
    asyncRoute(async (request, response) => {
      const rows = await db
        .select({
          id: businesses.id,
          name: businesses.name,
          province: businesses.province,
          town: businesses.town,
          contactEmail: businesses.contactEmail,
          contactPhone: businesses.contactPhone,
          whatsappPhone: businesses.whatsappPhone,
          agrisetaSupported: businesses.agrisetaSupported,
          agrisetaReference: businesses.agrisetaReference,
          approvedOn: businesses.updatedAt,
        })
        .from(businesses)
        .where(eq(businesses.verificationStatus, 'approved'))
        .orderBy(businesses.name);
      const offerings = rows.length
        ? await db
            .select({ businessId: listings.businessId, title: listings.title, category: categories.name, type: listings.type })
            .from(listings)
            .innerJoin(categories, eq(listings.categoryId, categories.id))
            .where(and(inArray(listings.businessId, rows.map((row) => row.id)), eq(listings.status, 'published')))
        : [];
      const byBusiness = new Map<string, { titles: Set<string>; categories: Set<string>; services: boolean; products: boolean }>();
      for (const offering of offerings) {
        const entry = byBusiness.get(offering.businessId) ?? { titles: new Set(), categories: new Set(), services: false, products: false };
        entry.titles.add(offering.title);
        entry.categories.add(offering.category);
        if (offering.type === 'service') entry.services = true;
        else entry.products = true;
        byBusiness.set(offering.businessId, entry);
      }
      await db.insert(auditLogs).values({ actorId: request.auth!.id, action: 'export.businesses', targetType: 'export', targetId: request.auth!.id, metadata: { rows: rows.length } });
      const csv = toCsv(
        ['Business ID', 'Business name', 'Province', 'Town', 'Contact email', 'Mobile', 'WhatsApp', 'AgriSETA-supported', 'AgriSETA reference', 'Offers', 'Categories', 'Live listings', 'Last updated'],
        rows.map((row) => {
          const entry = byBusiness.get(row.id);
          const offers = entry ? [entry.products ? 'Products' : '', entry.services ? 'Services' : ''].filter(Boolean).join(' and ') : '';
          return [
            row.id, row.name, row.province, row.town, row.contactEmail, row.contactPhone, row.whatsappPhone,
            row.agrisetaSupported ? 'Yes' : 'No', row.agrisetaReference, offers,
            entry ? [...entry.categories].join('; ') : '', entry ? [...entry.titles].join('; ') : '', row.approvedOn,
          ];
        }),
      );
      sendCsv(response, `agrimarket-verified-businesses-${today()}.csv`, csv);
    }),
  );

  router.get(
    '/exports/enquiries.csv',
    asyncRoute(async (request, response) => {
      // Linkage activity only: who asked whom about what. Message text and buyer emails stay private.
      const rows = await db
        .select({
          id: enquiries.id,
          createdAt: enquiries.createdAt,
          status: enquiries.status,
          outcome: enquiries.outcome,
          outcomeValueBand: enquiries.outcomeValueBand,
          businessName: businesses.name,
          agrisetaSupported: businesses.agrisetaSupported,
          businessProvince: businesses.province,
          listingTitle: listings.title,
          category: categories.name,
          buyerOrganisation: users.organisationName,
          buyerType: users.organisationType,
        })
        .from(enquiries)
        .innerJoin(businesses, eq(enquiries.businessId, businesses.id))
        .innerJoin(listings, eq(enquiries.listingId, listings.id))
        .innerJoin(categories, eq(listings.categoryId, categories.id))
        .innerJoin(users, eq(enquiries.buyerId, users.id))
        .orderBy(desc(enquiries.createdAt))
        .limit(10000);
      await db.insert(auditLogs).values({ actorId: request.auth!.id, action: 'export.enquiries', targetType: 'export', targetId: request.auth!.id, metadata: { rows: rows.length } });
      const csv = toCsv(
        ['Enquiry ID', 'Date', 'Status', 'Outcome', 'Deal value (ZAR)', 'Seller business', 'Seller AgriSETA-supported', 'Seller province', 'Listing', 'Category', 'Buyer organisation', 'Buyer type'],
        rows.map((row) => [
          row.id, row.createdAt, row.status, outcomeLabel(row.outcome), dealValueLabel(row.outcomeValueBand),
          row.businessName, row.agrisetaSupported ? 'Yes' : 'No', row.businessProvince,
          row.listingTitle, row.category, row.buyerOrganisation, row.buyerType ? buyerTypeLabel(row.buyerType) : '',
        ]),
      );
      sendCsv(response, `agrimarket-enquiries-${today()}.csv`, csv);
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

const buyerTypeLabels: Record<string, string> = {
  retailer: 'Retailer',
  hotel: 'Hotel',
  restaurant: 'Restaurant',
  processor: 'Processor',
  exporter: 'Exporter',
  municipality: 'Municipality',
  government_programme: 'Government programme',
  school: 'School',
  commercial_farm: 'Commercial farm',
  informal_trader: 'Informal trader',
  other: 'Other',
};

function buyerTypeLabel(type: string) {
  return buyerTypeLabels[type] ?? type;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function sendCsv(response: Response, filename: string, csv: string) {
  response.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.send(csv);
}