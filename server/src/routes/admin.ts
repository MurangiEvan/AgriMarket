import { and, desc, eq, inArray, like, lt, ne, or, sql } from 'drizzle-orm';
import { Router, type Response } from 'express';
import { z } from 'zod';

import type { Database } from '../db/client.js';
import { auditLogs, businesses, categories, enquiries, listingImages, listings, users, verificationSubmissions } from '../db/schema.js';
import { toCsv } from '../csv.js';
import { HttpError, asyncRoute } from '../http.js';
import { listingNotification, notify, verificationNotification } from '../notifications.js';
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
          agrisetaSupportClaimed: businesses.agrisetaSupportClaimed,
          agrisetaReference: businesses.agrisetaReference,
          agrisetaSupported: businesses.agrisetaSupported,
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
              imageId: sql<string | null>`(select ${listingImages.id} from ${listingImages} where ${listingImages.listingId} = ${listings.id} order by ${listingImages.sortOrder} limit 1)`,
            })
            .from(listings)
            .where(and(inArray(listings.businessId, businessIds), inArray(listings.status, ['pending', 'published', 'rejected'])))
            .orderBy(desc(listings.createdAt))
        : [];
      const photosByBusiness = new Map<string, Array<{ listingId: string; title: string; description: string; status: string; imageUrl: string | null }>>();
      for (const { businessId, imageId, ...photo } of photoRows) {
        const list = photosByBusiness.get(businessId) ?? [];
        if (list.length < 5) list.push({ ...photo, imageUrl: imageId ? `/api/v1/media/listings/${imageId}` : null });
        photosByBusiness.set(businessId, list);
      }
      response.json({ data: rows.map((row) => ({ ...row, photos: photosByBusiness.get(row.businessId) ?? [] })) });
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
          })
          .from(verificationSubmissions)
          .innerJoin(businesses, eq(verificationSubmissions.businessId, businesses.id))
          .where(and(eq(verificationSubmissions.id, verificationId), eq(verificationSubmissions.status, 'pending')))
          .limit(1)
          .for('update', { of: verificationSubmissions });
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

        // The AgriSETA badge is only shown when the seller claimed support and the admin confirmed it.
        await transaction
          .update(businesses)
          .set({
            verificationStatus: input.decision,
            agrisetaSupported: input.decision === 'approved' && input.confirmAgriseta && submission.agrisetaSupportClaimed,
            updatedAt: reviewedAt,
          })
          .where(eq(businesses.id, submission.businessId));

        await transaction.insert(auditLogs).values({
          actorId: request.auth!.id,
          action: `verification.${input.decision}`,
          targetType: 'verification_submission',
          targetId: submission.id,
          metadata: { businessId: submission.businessId },
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
          imageId: sql<string | null>`(select ${listingImages.id} from ${listingImages} where ${listingImages.listingId} = ${listings.id} order by ${listingImages.sortOrder} limit 1)`,
        })
        .from(listings)
        .innerJoin(businesses, eq(listings.businessId, businesses.id))
        // Photos from businesses still under review are part of their application (Verifications).
        .where(and(eq(listings.status, 'pending'), eq(businesses.verificationStatus, 'approved')))
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
        .select({ businessId: businesses.id, verificationStatus: businesses.verificationStatus, ownerId: businesses.ownerId, title: listings.title })
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
        const notification = listingNotification(target.ownerId, target.title, input.status, input.reason);
        if (notification) await notify(transaction, notification);
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
        // Pending photos inside an application are counted with the application, not as photos waiting.
        db
          .select({ status: listings.status, count })
          .from(listings)
          .innerJoin(businesses, eq(listings.businessId, businesses.id))
          .where(or(ne(listings.status, 'pending'), eq(businesses.verificationStatus, 'approved')))
          .groupBy(listings.status),
        db.select({ role: users.role, count }).from(users).where(eq(users.isActive, true)).groupBy(users.role),
      ]);
      const [buyerTypeRows, agrisetaRows] = await Promise.all([
        db
          .select({ type: users.organisationType, count })
          .from(users)
          .where(and(eq(users.role, 'buyer'), eq(users.isActive, true)))
          .groupBy(users.organisationType),
        db.select({ count }).from(businesses).where(and(eq(businesses.verificationStatus, 'approved'), eq(businesses.agrisetaSupported, true))),
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
        ['Enquiry ID', 'Date', 'Status', 'Seller business', 'Seller AgriSETA-supported', 'Seller province', 'Listing', 'Category', 'Buyer organisation', 'Buyer type'],
        rows.map((row) => [
          row.id, row.createdAt, row.status, row.businessName, row.agrisetaSupported ? 'Yes' : 'No', row.businessProvince,
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