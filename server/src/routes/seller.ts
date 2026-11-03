import { and, count, desc, eq, inArray, asc } from 'drizzle-orm';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';

import type { Database } from '../db/client.js';
import { businesses, categories, listingImages, listings, produceTypes, verificationSubmissions } from '../db/schema.js';
import { searchLocations } from '../geocoding.js';
import { HttpError, asyncRoute } from '../http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { normalizeSouthAfricanPhone } from '../policies.js';
import type { PrivateStorage, PublicImageStorage } from '../storage.js';
import { businessSchema, listingCreateSchema, listingUpdateSchema } from '../validation.js';

const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
});
const listingImageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 5 } });

export function createSellerRouter(
  db: Database,
  storage: PrivateStorage,
  imageStorage: PublicImageStorage,
  sessionSecret: string,
  googleMapsApiKey?: string,
): Router {
  const router = Router();
  router.use(requireAuth(db, sessionSecret), requireRole('seller'));

  router.get(
    '/business',
    asyncRoute(async (request, response) => {
      const [business] = await db.select().from(businesses).where(eq(businesses.ownerId, request.auth!.id)).limit(1);
      response.json({ data: { business: business ?? null } });
    }),
  );

  router.put(
    '/business',
    asyncRoute(async (request, response) => {
      const input = businessSchema.parse(request.body);
      const locationQuery = [input.address, input.town, input.province, 'South Africa'].filter(Boolean).join(', ');
      const location = input.address || input.town
        ? (await searchLocations(locationQuery, googleMapsApiKey))[0]
        : undefined;
      if ((input.address || input.town) && !location) {
        throw new HttpError(400, 'LOCATION_NOT_FOUND', 'The business address could not be located. Check the address or area and try again.');
      }
      const normalized = {
        ...input,
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
        contactEmail: input.contactEmail?.toLowerCase() || null,
        contactPhone: normalizeSouthAfricanPhone(input.contactPhone),
        whatsappPhone: normalizeSouthAfricanPhone(input.whatsappPhone),
        updatedAt: new Date(),
      };
      const [business] = await db
        .insert(businesses)
        .values({ ...normalized, ownerId: request.auth!.id })
        .onConflictDoUpdate({ target: businesses.ownerId, set: normalized })
        .returning({
          id: businesses.id,
          name: businesses.name,
          description: businesses.description,
          province: businesses.province,
          town: businesses.town,
          contactEmail: businesses.contactEmail,
          contactPhone: businesses.contactPhone,
          whatsappPhone: businesses.whatsappPhone,
          verificationStatus: businesses.verificationStatus,
        });
      response.json({ data: { business } });
    }),
  );

  router.get(
    '/produce-types',
    asyncRoute(async (request, response) => {
      const categoryId = z.uuid().parse(request.query.categoryId);
      const result = await db
        .select({ id: produceTypes.id, categoryId: produceTypes.categoryId, name: produceTypes.name })
        .from(produceTypes)
        .innerJoin(categories, eq(categories.id, produceTypes.categoryId))
        .where(
          and(
            eq(produceTypes.categoryId, categoryId),
            eq(produceTypes.active, true),
            eq(categories.isActive, true),
          ),
        )
        .orderBy(asc(produceTypes.name));
      response.json({ data: result });
    }),
  );

  router.get(
    '/listings',
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
        .select()
        .from(listings)
        .where(eq(listings.businessId, business.id))
        .orderBy(desc(listings.updatedAt))
        .limit(100);
      const images = rows.length
        ? await db
            .select({ id: listingImages.id, listingId: listingImages.listingId, altText: listingImages.altText })
            .from(listingImages)
            .where(inArray(listingImages.listingId, rows.map((row) => row.id)))
            .orderBy(listingImages.sortOrder)
        : [];
      const imageMap = new Map<string, typeof images>();
      for (const image of images) imageMap.set(image.listingId, [...(imageMap.get(image.listingId) ?? []), image]);
      response.json({ data: rows.map((row) => ({
        ...row,
        images: (imageMap.get(row.id) ?? []).map((image) => ({
          id: image.id,
          altText: image.altText,
          url: `/api/v1/media/listings/${image.id}`,
        })),
      })) });
    }),
  );

  router.post(
    '/listings',
    asyncRoute(async (request, response) => {
      const input = listingCreateSchema.parse(request.body);
      const [business] = await db
        .select({ id: businesses.id })
        .from(businesses)
        .where(eq(businesses.ownerId, request.auth!.id))
        .limit(1);
      if (!business) throw new HttpError(409, 'BUSINESS_REQUIRED', 'Create a business profile before adding a listing.');
      const [category] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.id, input.categoryId), eq(categories.isActive, true)))
        .limit(1);
      if (!category) throw new HttpError(400, 'INVALID_CATEGORY', 'Choose an active listing category.');
      const [produceType] = await db
        .select({ id: produceTypes.id })
        .from(produceTypes)
        .where(
          and(
            eq(produceTypes.id, input.produceTypeId),
            eq(produceTypes.categoryId, input.categoryId),
            eq(produceTypes.active, true),
          ),
        )
        .limit(1);
      if (!produceType) throw new HttpError(400, 'INVALID_PRODUCE_TYPE', 'Choose an active produce type in this category.');
      const [listing] = await db
        .insert(listings)
        .values({ ...input, businessId: business.id, status: 'draft' })
        .returning();
      response.status(201).json({ data: { listing } });
    }),
  );

  router.put(
    '/listings/:listingId',
    asyncRoute(async (request, response) => {
      const listingId = z.uuid().parse(request.params.listingId);
      const input = listingUpdateSchema.parse(request.body);
      if (Object.keys(input).length === 0) throw new HttpError(400, 'EMPTY_UPDATE', 'Provide at least one listing field.');
      const [business] = await db
        .select({ id: businesses.id })
        .from(businesses)
        .where(eq(businesses.ownerId, request.auth!.id))
        .limit(1);
      if (!business) throw new HttpError(404, 'NOT_FOUND', 'The listing was not found.');
      if (input.categoryId) {
        const [category] = await db
          .select({ id: categories.id })
          .from(categories)
          .where(and(eq(categories.id, input.categoryId), eq(categories.isActive, true)))
          .limit(1);
        if (!category) throw new HttpError(400, 'INVALID_CATEGORY', 'Choose an active listing category.');
      }
      const [current] = await db
        .select({ status: listings.status, categoryId: listings.categoryId, produceTypeId: listings.produceTypeId })
        .from(listings)
        .where(and(eq(listings.id, listingId), eq(listings.businessId, business.id)))
        .limit(1);
      if (!current || current.status === 'archived') throw new HttpError(404, 'NOT_FOUND', 'The listing was not found.');
      const categoryId = input.categoryId ?? current.categoryId;
      const produceTypeId = input.produceTypeId ?? current.produceTypeId;
      const [produceType] = await db
        .select({ id: produceTypes.id })
        .from(produceTypes)
        .where(
          and(
            eq(produceTypes.id, produceTypeId),
            eq(produceTypes.categoryId, categoryId),
            eq(produceTypes.active, true),
          ),
        )
        .limit(1);
      if (!produceType) throw new HttpError(400, 'INVALID_PRODUCE_TYPE', 'Choose an active produce type in this category.');
      const [listing] = await db
        .update(listings)
        .set({ ...input, status: current.status === 'draft' ? 'draft' : 'pending', updatedAt: new Date() })
        .where(and(eq(listings.id, listingId), eq(listings.businessId, business.id)))
        .returning();
      response.json({ data: { listing } });
    }),
  );

  router.post(
    '/listings/:listingId/submit',
    asyncRoute(async (request, response) => {
      const listingId = z.uuid().parse(request.params.listingId);
      const [business] = await db
        .select({ id: businesses.id })
        .from(businesses)
        .where(eq(businesses.ownerId, request.auth!.id))
        .limit(1);
      if (!business) throw new HttpError(404, 'NOT_FOUND', 'The listing was not found.');
      const [listing] = await db
        .update(listings)
        .set({ status: 'pending', updatedAt: new Date() })
        .where(
          and(
            eq(listings.id, listingId),
            eq(listings.businessId, business.id),
            eq(listings.status, 'draft'),
          ),
        )
        .returning({ id: listings.id, status: listings.status });
      if (!listing) throw new HttpError(409, 'LISTING_NOT_SUBMITTABLE', 'Only a draft listing can be submitted.');
      response.json({ data: { listing } });
    }),
  );

  router.post(
    '/listings/:listingId/images',
    listingImageUpload.array('images', 5),
    asyncRoute(async (request, response) => {
      const listingId = z.uuid().parse(request.params.listingId);
      const files = (request.files ?? []) as Express.Multer.File[];
      let rawAltTexts: unknown;
      try {
        rawAltTexts = typeof request.body.altTexts === 'string' ? JSON.parse(request.body.altTexts) : [];
      } catch {
        throw new HttpError(400, 'INVALID_ALT_TEXT', 'Provide valid alt text for every image.');
      }
      const altTexts = z.array(z.string().trim().min(5).max(180)).max(5).parse(rawAltTexts);
      if (!files.length || altTexts.length !== files.length) {
        throw new HttpError(400, 'IMAGES_REQUIRED', 'Provide one descriptive alt text for each selected image.');
      }
      const [business] = await db
        .select({ id: businesses.id })
        .from(businesses)
        .where(eq(businesses.ownerId, request.auth!.id))
        .limit(1);
      if (!business) throw new HttpError(404, 'NOT_FOUND', 'The listing was not found.');
      const [listing] = await db
        .select({ id: listings.id, status: listings.status })
        .from(listings)
        .where(and(eq(listings.id, listingId), eq(listings.businessId, business.id)))
        .limit(1);
      if (!listing || listing.status === 'archived') throw new HttpError(404, 'NOT_FOUND', 'The listing was not found.');

      const stored: Array<{ storageKey: string; mimeType: string; byteSize: number; width: number; height: number }> = [];
      try {
        for (const file of files) stored.push(await imageStorage.storeListingImage({ buffer: file.buffer, size: file.size }));
        const inserted = await db.transaction(async (transaction) => {
          const [lockedListing] = await transaction
            .select({ id: listings.id, status: listings.status })
            .from(listings)
            .where(and(eq(listings.id, listingId), eq(listings.businessId, business.id)))
            .limit(1)
            .for('update');
          if (!lockedListing || lockedListing.status === 'archived') {
            throw new HttpError(404, 'NOT_FOUND', 'The listing was not found.');
          }
          const [imageCount] = await transaction
            .select({ value: count() })
            .from(listingImages)
            .where(eq(listingImages.listingId, listingId));
          if ((imageCount?.value ?? 0) + stored.length > 5) {
            throw new HttpError(409, 'IMAGE_LIMIT_REACHED', 'A listing can have up to five photos.');
          }
          const [lastImage] = await transaction
            .select({ sortOrder: listingImages.sortOrder })
            .from(listingImages)
            .where(eq(listingImages.listingId, listingId))
            .orderBy(desc(listingImages.sortOrder))
            .limit(1);
          const startOrder = (lastImage?.sortOrder ?? -1) + 1;
          const rows = await transaction
            .insert(listingImages)
            .values(stored.map((image, index) => ({
              listingId,
              storageKey: image.storageKey,
              mimeType: image.mimeType,
              byteSize: image.byteSize,
              width: image.width,
              height: image.height,
              altText: altTexts[index]!,
              sortOrder: startOrder + index,
            })))
            .returning({ id: listingImages.id, altText: listingImages.altText });
          await transaction.update(listings).set({ updatedAt: new Date() }).where(eq(listings.id, listingId));
          return rows;
        });
        response.status(201).json({ data: { images: inserted.map((image) => ({ ...image, url: `/api/v1/media/listings/${image.id}` })) } });
      } catch (error) {
        await Promise.all(stored.map((image) => imageStorage.removePublicImage(image.storageKey)));
        throw error;
      }
    }),
  );

  router.post(
    '/verification',
    documentUpload.array('documents', 5),
    asyncRoute(async (request, response) => {
      const files = (request.files ?? []) as Express.Multer.File[];
      if (files.length === 0) throw new HttpError(400, 'DOCUMENTS_REQUIRED', 'Choose at least one supporting document.');
      const [business] = await db
        .select({ id: businesses.id, verificationStatus: businesses.verificationStatus })
        .from(businesses)
        .where(eq(businesses.ownerId, request.auth!.id))
        .limit(1);
      if (!business) throw new HttpError(409, 'BUSINESS_REQUIRED', 'Create a business profile before submitting documents.');
      if (business.verificationStatus === 'pending' || business.verificationStatus === 'approved') {
        throw new HttpError(409, 'SUBMISSION_NOT_ALLOWED', 'A pending or approved business cannot submit another verification request.');
      }

      const storedKeys: string[] = [];
      try {
        for (const file of files) {
          storedKeys.push(await storage.storeVerificationDocument({ buffer: file.buffer, size: file.size }));
        }
        const submission = await db.transaction(async (transaction) => {
          const [created] = await transaction
            .insert(verificationSubmissions)
            .values({ businessId: business.id, submitterId: request.auth!.id, storageKeys: storedKeys, status: 'pending' })
            .returning({ id: verificationSubmissions.id, status: verificationSubmissions.status, submittedAt: verificationSubmissions.submittedAt });
          await transaction
            .update(businesses)
            .set({ verificationStatus: 'pending', updatedAt: new Date() })
            .where(eq(businesses.id, business.id));
          return created;
        });
        response.status(201).json({ data: { submission } });
      } catch (error) {
        await Promise.all(storedKeys.map((key) => storage.removePrivateObject(key)));
        throw error;
      }
    }),
  );

  router.get(
    '/verification',
    asyncRoute(async (request, response) => {
      const [business] = await db
        .select({ id: businesses.id, verificationStatus: businesses.verificationStatus })
        .from(businesses)
        .where(eq(businesses.ownerId, request.auth!.id))
        .limit(1);
      if (!business) {
        response.json({ data: { verificationStatus: 'not_submitted', submissions: [] } });
        return;
      }
      const submissions = await db
        .select({
          id: verificationSubmissions.id,
          status: verificationSubmissions.status,
          sellerFeedback: verificationSubmissions.sellerFeedback,
          submittedAt: verificationSubmissions.submittedAt,
          reviewedAt: verificationSubmissions.reviewedAt,
        })
        .from(verificationSubmissions)
        .where(eq(verificationSubmissions.businessId, business.id))
        .orderBy(desc(verificationSubmissions.submittedAt))
        .limit(20);
      response.json({ data: { verificationStatus: business.verificationStatus, submissions } });
    }),
  );

  return router;
}