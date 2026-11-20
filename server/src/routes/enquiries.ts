import { and, desc, eq, gt, isNull, or } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';

import type { Database } from '../db/client.js';
import { businesses, enquiries, listings, ratings, users } from '../db/schema.js';
import { HttpError, asyncRoute } from '../http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { enquiryNotification, notify } from '../notifications.js';
import { assertNotOwnListing, canTransitionEnquiry } from '../policies.js';
import { assertEnquiryRateable, assertRatingEditable, commentStatusFor, MIN_RATINGS_TO_SHOW, publicSummary } from '../ratings.js';
import { enquiryCreateSchema, enquiryStatusSchema, ratingSchema } from '../validation.js';

export function createBuyerEnquiriesRouter(db: Database, sessionSecret: string): Router {
  const router = Router();
  // Sellers can buy too (one account, both roles); only administrators are kept out.
  router.use(requireAuth(db, sessionSecret), requireRole('buyer', 'seller'));

  router.post(
    '/',
    asyncRoute(async (request, response) => {
      const input = enquiryCreateSchema.parse(request.body);
      const idempotencyKey = z.uuid().parse(request.get('idempotency-key'));
      const [existing] = await db
        .select()
        .from(enquiries)
        .where(and(eq(enquiries.buyerId, request.auth!.id), eq(enquiries.idempotencyKey, idempotencyKey)))
        .limit(1);
      if (existing) {
        if (existing.listingId !== input.listingId || existing.message !== input.message) {
          throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'This submission key was already used for another enquiry.');
        }
        response.status(200).json({ data: { enquiry: existing } });
        return;
      }

      // Sellers need to know who is enquiring (a hotel, a school, a processor...).
      const [buyer] = await db
        .select({ organisationName: users.organisationName, organisationType: users.organisationType })
        .from(users)
        .where(eq(users.id, request.auth!.id))
        .limit(1);
      if (!buyer?.organisationName || !buyer.organisationType) {
        throw new HttpError(409, 'BUYER_PROFILE_REQUIRED', 'Tell sellers who you buy for first: add your organisation name and type on your Profile page.');
      }

      const [listing] = await db
        .select({ id: listings.id, businessId: businesses.id, title: listings.title, ownerId: businesses.ownerId })
        .from(listings)
        .innerJoin(businesses, eq(listings.businessId, businesses.id))
        .where(
          and(
            eq(listings.id, input.listingId),
            eq(listings.status, 'published'),
            eq(listings.active, true),
            eq(listings.inStock, true),
            or(isNull(listings.expiresAt), gt(listings.expiresAt, new Date())),
            eq(businesses.verificationStatus, 'approved'),
          ),
        )
        .limit(1);
      if (!listing) throw new HttpError(404, 'NOT_FOUND', 'The requested listing was not found.');
      assertNotOwnListing(listing.ownerId, request.auth!.id);

      // The enquiry and the seller's notification are saved together. A retried submission
      // (same idempotency key) inserts nothing, so the seller is not notified twice.
      const created = await db.transaction(async (transaction) => {
        const [inserted] = await transaction
          .insert(enquiries)
          .values({
            buyerId: request.auth!.id,
            businessId: listing.businessId,
            listingId: listing.id,
            message: input.message,
            idempotencyKey,
          })
          .onConflictDoNothing({ target: [enquiries.buyerId, enquiries.idempotencyKey] })
          .returning();
        if (inserted) await notify(transaction, enquiryNotification(listing.ownerId, listing.title, input.message, buyer.organisationName));
        return inserted;
      });
      if (created) {
        response.status(201).json({ data: { enquiry: created } });
        return;
      }

      const [duplicate] = await db
        .select()
        .from(enquiries)
        .where(and(eq(enquiries.buyerId, request.auth!.id), eq(enquiries.idempotencyKey, idempotencyKey)))
        .limit(1);
      if (!duplicate || duplicate.listingId !== input.listingId || duplicate.message !== input.message) {
        throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'This submission key was already used for another enquiry.');
      }
      response.status(200).json({ data: { enquiry: duplicate } });
    }),
  );

  router.get(
    '/mine',
    asyncRoute(async (request, response) => {
      const rows = await db
        .select({
          id: enquiries.id,
          message: enquiries.message,
          status: enquiries.status,
          // Buyers see whether a deal was recorded, but not the value range the seller gave AgriMarket.
          outcome: enquiries.outcome,
          createdAt: enquiries.createdAt,
          listingId: listings.id,
          listingTitle: listings.title,
          businessId: businesses.id,
          businessName: businesses.name,
          ratingStars: ratings.stars,
          ratingComment: ratings.comment,
          ratingCommentStatus: ratings.commentStatus,
          ratingCreatedAt: ratings.createdAt,
        })
        .from(enquiries)
        .innerJoin(listings, eq(enquiries.listingId, listings.id))
        .innerJoin(businesses, eq(enquiries.businessId, businesses.id))
        .leftJoin(ratings, eq(ratings.enquiryId, enquiries.id))
        .where(eq(enquiries.buyerId, request.auth!.id))
        .orderBy(desc(enquiries.createdAt))
        .limit(100);
      response.json({
        data: rows.map(({ ratingStars, ratingComment, ratingCommentStatus, ratingCreatedAt, ...row }) => ({
          ...row,
          rating: ratingStars === null
            ? null
            : { stars: ratingStars, comment: ratingComment, commentStatus: ratingCommentStatus, createdAt: ratingCreatedAt },
        })),
      });
    }),
  );

  // Rate the supplier for one of your own enquiries once they have responded or closed it.
  // POST creates the rating; PUT changes it within 30 days.
  router.post(
    '/:enquiryId/rating',
    asyncRoute(async (request, response) => {
      const enquiryId = z.uuid().parse(request.params.enquiryId);
      const input = ratingSchema.parse(request.body);
      const enquiry = await ownEnquiry(db, enquiryId, request.auth!.id);
      assertEnquiryRateable(enquiry.status);
      const [existing] = await db.select({ id: ratings.id }).from(ratings).where(eq(ratings.enquiryId, enquiryId)).limit(1);
      if (existing) throw new HttpError(409, 'ALREADY_RATED', 'You have already rated this supplier for this enquiry. You can change your rating instead.');
      const [created] = await db
        .insert(ratings)
        .values({
          enquiryId,
          buyerId: request.auth!.id,
          businessId: enquiry.businessId,
          stars: input.stars,
          comment: input.comment,
          commentStatus: commentStatusFor(input.comment),
        })
        .returning({ stars: ratings.stars, comment: ratings.comment, commentStatus: ratings.commentStatus, createdAt: ratings.createdAt });
      response.status(201).json({ data: { rating: created } });
    }),
  );

  router.put(
    '/:enquiryId/rating',
    asyncRoute(async (request, response) => {
      const enquiryId = z.uuid().parse(request.params.enquiryId);
      const input = ratingSchema.parse(request.body);
      await ownEnquiry(db, enquiryId, request.auth!.id);
      const [existing] = await db
        .select({ id: ratings.id, comment: ratings.comment, commentStatus: ratings.commentStatus, createdAt: ratings.createdAt, hidden: ratings.hidden })
        .from(ratings)
        .where(eq(ratings.enquiryId, enquiryId))
        .limit(1);
      if (!existing) throw new HttpError(404, 'NOT_FOUND', 'You have not rated this enquiry yet.');
      if (existing.hidden) throw new HttpError(409, 'RATING_HIDDEN', 'This rating was hidden by an administrator and can no longer be changed.');
      assertRatingEditable(existing.createdAt);
      // A changed comment goes back for review; an unchanged one keeps its approval.
      const commentStatus = input.comment === existing.comment ? existing.commentStatus : commentStatusFor(input.comment);
      const [updated] = await db
        .update(ratings)
        .set({ stars: input.stars, comment: input.comment, commentStatus, updatedAt: new Date() })
        .where(eq(ratings.id, existing.id))
        .returning({ stars: ratings.stars, comment: ratings.comment, commentStatus: ratings.commentStatus, createdAt: ratings.createdAt });
      response.json({ data: { rating: updated } });
    }),
  );

  return router;
}

async function ownEnquiry(db: Database, enquiryId: string, buyerId: string) {
  const [enquiry] = await db
    .select({ status: enquiries.status, businessId: enquiries.businessId })
    .from(enquiries)
    .where(and(eq(enquiries.id, enquiryId), eq(enquiries.buyerId, buyerId)))
    .limit(1);
  if (!enquiry) throw new HttpError(404, 'NOT_FOUND', 'The enquiry was not found.');
  return enquiry;
}

export function createSellerEnquiriesRouter(db: Database, sessionSecret: string): Router {
  const router = Router();
  router.use(requireAuth(db, sessionSecret), requireRole('seller'));

  router.get(
    '/',
    asyncRoute(async (request, response) => {
      const [business] = await db
        .select({ id: businesses.id })
        .from(businesses)
        .where(eq(businesses.ownerId, request.auth!.id))
        .limit(1);
      if (!business) {
        response.json({ data: [] });
        return;
      }
      const rows = await db
        .select({
          id: enquiries.id,
          message: enquiries.message,
          status: enquiries.status,
          outcome: enquiries.outcome,
          outcomeValueBand: enquiries.outcomeValueBand,
          createdAt: enquiries.createdAt,
          updatedAt: enquiries.updatedAt,
          listingId: listings.id,
          listingTitle: listings.title,
          buyerEmail: users.email,
          buyerOrganisationName: users.organisationName,
          buyerOrganisationType: users.organisationType,
          buyerActive: users.isActive,
        })
        .from(enquiries)
        .innerJoin(listings, eq(enquiries.listingId, listings.id))
        .innerJoin(users, eq(enquiries.buyerId, users.id))
        .where(eq(enquiries.businessId, business.id))
        .orderBy(desc(enquiries.createdAt))
        .limit(100);
      // A buyer whose account was deleted keeps their old messages here, but no contact details.
      response.json({
        data: rows.map(({ buyerActive, ...row }) =>
          buyerActive ? row : { ...row, buyerEmail: null, buyerOrganisationName: 'Deleted user', buyerOrganisationType: null },
        ),
      });
    }),
  );

  // The seller's own ratings: their average (even before it is public) and the comments buyers wrote.
  // Comments still waiting for an administrator are counted but not shown.
  router.get(
    '/ratings',
    asyncRoute(async (request, response) => {
      const [business] = await db.select({ id: businesses.id }).from(businesses).where(eq(businesses.ownerId, request.auth!.id)).limit(1);
      if (!business) {
        response.json({ data: { ratingCount: 0, ratingAverage: null, publicFrom: MIN_RATINGS_TO_SHOW, pendingComments: 0, reviews: [] } });
        return;
      }
      const rows = await db
        .select({
          id: ratings.id,
          stars: ratings.stars,
          comment: ratings.comment,
          commentStatus: ratings.commentStatus,
          buyerType: users.organisationType,
          createdAt: ratings.createdAt,
        })
        .from(ratings)
        .innerJoin(users, eq(ratings.buyerId, users.id))
        .where(and(eq(ratings.businessId, business.id), eq(ratings.hidden, false)))
        .orderBy(desc(ratings.createdAt))
        .limit(200);
      const average = rows.length ? rows.reduce((total, row) => total + row.stars, 0) / rows.length : null;
      response.set('Cache-Control', 'private, no-store');
      response.json({
        data: {
          ratingCount: rows.length,
          ratingAverage: average === null ? null : Math.round(average * 10) / 10,
          // The average appears to buyers once this many ratings exist.
          publicFrom: MIN_RATINGS_TO_SHOW,
          isPublic: publicSummary(rows.length, average).ratingAverage !== null,
          pendingComments: rows.filter((row) => row.commentStatus === 'pending').length,
          reviews: rows
            .filter((row) => row.commentStatus === 'approved')
            .slice(0, 20)
            .map(({ commentStatus: _status, ...row }) => row),
        },
      });
    }),
  );

  router.patch(
    '/:enquiryId',
    asyncRoute(async (request, response) => {
      const { status, outcome, outcomeValueBand } = enquiryStatusSchema.parse(request.body);
      const [business] = await db
        .select({ id: businesses.id })
        .from(businesses)
        .where(eq(businesses.ownerId, request.auth!.id))
        .limit(1);
      if (!business) throw new HttpError(404, 'NOT_FOUND', 'The enquiry was not found.');
      const enquiryId = z.uuid().parse(request.params.enquiryId);
      const [current] = await db
        .select({ id: enquiries.id, status: enquiries.status })
        .from(enquiries)
        .where(and(eq(enquiries.id, enquiryId), eq(enquiries.businessId, business.id)))
        .limit(1);
      if (!current) throw new HttpError(404, 'NOT_FOUND', 'The enquiry was not found.');
      if (!canTransitionEnquiry(current.status, status)) {
        throw new HttpError(409, 'INVALID_STATUS_TRANSITION', 'This enquiry status cannot be changed to the requested state.');
      }
      // An enquiry that is already closed keeps the outcome recorded when it was closed.
      const closing = status === 'closed' && current.status !== 'closed';
      const [updated] = await db
        .update(enquiries)
        .set({
          status,
          updatedAt: new Date(),
          ...(closing
            ? { outcome, outcomeValueBand: outcome === 'deal_made' ? outcomeValueBand ?? null : null, outcomeRecordedAt: new Date() }
            : {}),
        })
        .where(eq(enquiries.id, current.id))
        .returning({
          id: enquiries.id,
          status: enquiries.status,
          outcome: enquiries.outcome,
          outcomeValueBand: enquiries.outcomeValueBand,
          updatedAt: enquiries.updatedAt,
        });
      response.json({ data: { enquiry: updated } });
    }),
  );

  return router;
}