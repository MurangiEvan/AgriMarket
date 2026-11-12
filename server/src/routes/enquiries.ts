import { and, desc, eq, gt, isNull, or } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';

import type { Database } from '../db/client.js';
import { businesses, enquiries, listings, users } from '../db/schema.js';
import { HttpError, asyncRoute } from '../http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { enquiryNotification, notify } from '../notifications.js';
import { canTransitionEnquiry } from '../policies.js';
import { enquiryCreateSchema, enquiryStatusSchema } from '../validation.js';

export function createBuyerEnquiriesRouter(db: Database, sessionSecret: string): Router {
  const router = Router();
  router.use(requireAuth(db, sessionSecret), requireRole('buyer'));

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
        if (inserted) await notify(transaction, enquiryNotification(listing.ownerId, listing.title, input.message));
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
          createdAt: enquiries.createdAt,
          listingId: listings.id,
          listingTitle: listings.title,
          businessId: businesses.id,
          businessName: businesses.name,
        })
        .from(enquiries)
        .innerJoin(listings, eq(enquiries.listingId, listings.id))
        .innerJoin(businesses, eq(enquiries.businessId, businesses.id))
        .where(eq(enquiries.buyerId, request.auth!.id))
        .orderBy(desc(enquiries.createdAt))
        .limit(100);
      response.json({ data: rows });
    }),
  );

  return router;
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
          createdAt: enquiries.createdAt,
          updatedAt: enquiries.updatedAt,
          listingId: listings.id,
          listingTitle: listings.title,
          buyerEmail: users.email,
        })
        .from(enquiries)
        .innerJoin(listings, eq(enquiries.listingId, listings.id))
        .innerJoin(users, eq(enquiries.buyerId, users.id))
        .where(eq(enquiries.businessId, business.id))
        .orderBy(desc(enquiries.createdAt))
        .limit(100);
      response.json({ data: rows });
    }),
  );

  router.patch(
    '/:enquiryId',
    asyncRoute(async (request, response) => {
      const { status } = enquiryStatusSchema.parse(request.body);
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
      const [updated] = await db
        .update(enquiries)
        .set({ status, updatedAt: new Date() })
        .where(eq(enquiries.id, current.id))
        .returning({ id: enquiries.id, status: enquiries.status, updatedAt: enquiries.updatedAt });
      response.json({ data: { enquiry: updated } });
    }),
  );

  return router;
}