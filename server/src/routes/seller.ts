import { and, count, desc, eq, inArray, asc } from 'drizzle-orm';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';

import type { Database } from '../db/client.js';
import { auditLogs, businesses, categories, listingImages, listings, produceTypes, verificationSubmissions } from '../db/schema.js';
import { searchLocations } from '../geocoding.js';
import { HttpError, asyncRoute } from '../http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { missingApplicationDetails, normalizeSouthAfricanPhone } from '../policies.js';
import type { PrivateStorage, PublicImageStorage } from '../storage.js';
import { businessSchema, listingCreateSchema, listingUpdateSchema } from '../validation.js';

const MAX_LISTING_PHOTO_BYTES = 5 * 1024 * 1024;
const listingImageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_LISTING_PHOTO_BYTES, files: 5 } });
// Up to 5 documents (10 MB each) plus one produce photo (5 MB, checked in the route).
const applicationUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 6 } });

const applicationFieldsSchema = z.object({
  categoryId: z.uuid({ message: 'Choose a produce category.' }),
  produceTypeId: z.uuid({ message: 'Choose what your produce is.' }),
  note: z.string().trim().max(1000).optional(),
});

// Before approval, produce photos travel inside the seller application. Separate photos can
// only be added once the admin has approved the business.
async function requireApprovedBusiness(db: Database, ownerId: string) {
  const [business] = await db
    .select({ id: businesses.id, verificationStatus: businesses.verificationStatus })
    .from(businesses)
    .where(eq(businesses.ownerId, ownerId))
    .limit(1);
  if (!business) throw new HttpError(409, 'BUSINESS_REQUIRED', 'Create a business profile before adding a listing.');
  if (business.verificationStatus !== 'approved') {
    throw new HttpError(409, 'BUSINESS_NOT_APPROVED', 'Send your produce photo with your seller application. You can add more photos after the admin approves your business.');
  }
  return business;
}

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
        ? (await searchLocations(locationQuery, googleMapsApiKey)).locations[0]
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
      const business = await requireApprovedBusiness(db, request.auth!.id);
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
      const business = await requireApprovedBusiness(db, request.auth!.id);
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
    '/listings/:listingId/archive',
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
        .set({ status: 'archived', updatedAt: new Date() })
        .where(and(eq(listings.id, listingId), eq(listings.businessId, business.id)))
        .returning({ id: listings.id, status: listings.status });
      if (!listing) throw new HttpError(404, 'NOT_FOUND', 'The listing was not found.');
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
      const business = await requireApprovedBusiness(db, request.auth!.id);
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

  // Documents used to be sent on their own. Applications must now be complete, so point older
  // app versions to the new route instead of creating a documents-only submission.
  router.post(
    '/verification',
    asyncRoute(async () => {
      throw new HttpError(409, 'APPLICATION_REQUIRED', 'Update the AgriMarket app, then send your business details, documents and a produce photo together with "Submit application".');
    }),
  );

  // The whole seller application in one request: the saved business profile must be complete,
  // plus 1–5 private verification documents and one produce photo. Everything is saved together
  // and goes to the admin's verification queue as a single application.
  router.post(
    '/application',
    applicationUpload.fields([{ name: 'documents', maxCount: 5 }, { name: 'photo', maxCount: 1 }]),
    asyncRoute(async (request, response) => {
      const uploaded = (request.files ?? {}) as Record<string, Express.Multer.File[] | undefined>;
      const documents = uploaded.documents ?? [];
      const photo = uploaded.photo?.[0];
      const fields = applicationFieldsSchema.parse(request.body);

      const [business] = await db
        .select({
          id: businesses.id,
          name: businesses.name,
          description: businesses.description,
          province: businesses.province,
          town: businesses.town,
          contactEmail: businesses.contactEmail,
          contactPhone: businesses.contactPhone,
          whatsappPhone: businesses.whatsappPhone,
          verificationStatus: businesses.verificationStatus,
        })
        .from(businesses)
        .where(eq(businesses.ownerId, request.auth!.id))
        .limit(1);
      if (!business) throw new HttpError(409, 'BUSINESS_REQUIRED', 'Save your business details before submitting your application.');
      if (business.verificationStatus === 'pending') {
        throw new HttpError(409, 'APPLICATION_PENDING', 'Your application is already with the admin. You will be notified when it has been reviewed.');
      }
      if (business.verificationStatus === 'approved') {
        throw new HttpError(409, 'ALREADY_APPROVED', 'Your business is already approved. Add more produce photos from your profile.');
      }
      const missing = missingApplicationDetails(business);
      if (missing.length) {
        throw new HttpError(400, 'APPLICATION_INCOMPLETE', `Complete your business details first: ${missing.join(', ')}.`);
      }
      if (documents.length === 0) throw new HttpError(400, 'DOCUMENTS_REQUIRED', 'Add at least one verification document, such as your CIPC registration certificate.');
      if (!photo) throw new HttpError(400, 'PHOTO_REQUIRED', 'Add a photo of your produce.');
      if (photo.size > MAX_LISTING_PHOTO_BYTES) throw new HttpError(413, 'FILE_TOO_LARGE', 'The produce photo must be 5 MB or smaller.');

      const [choice] = await db
        .select({ produceTypeName: produceTypes.name, categorySlug: categories.slug })
        .from(produceTypes)
        .innerJoin(categories, eq(produceTypes.categoryId, categories.id))
        .where(and(
          eq(produceTypes.id, fields.produceTypeId),
          eq(produceTypes.categoryId, fields.categoryId),
          eq(produceTypes.active, true),
          eq(categories.isActive, true),
        ))
        .limit(1);
      if (!choice) throw new HttpError(400, 'INVALID_PRODUCE_TYPE', 'Choose what your produce is from the list.');

      const note = fields.note ?? '';
      const place = business.town ? ` in ${business.town}` : '';
      const listingInput = listingCreateSchema.parse({
        categoryId: fields.categoryId,
        produceTypeId: fields.produceTypeId,
        title: choice.produceTypeName.length >= 3 ? choice.produceTypeName : `${choice.produceTypeName} produce`,
        description: note.length >= 10 ? note : `${choice.produceTypeName} from ${business.name}${place}.${note ? ` ${note}` : ''}`,
        province: business.province,
        town: business.town,
        type: choice.categorySlug === 'agricultural-services' ? 'service' : 'product',
      });
      const altText = `${choice.produceTypeName} from ${business.name}`.slice(0, 180);

      // Store the files first; if anything later fails, remove them so nothing is left behind.
      const storedKeys: string[] = [];
      let storedPhoto: Awaited<ReturnType<PublicImageStorage['storeListingImage']>> | null = null;
      try {
        for (const file of documents) {
          storedKeys.push(await storage.storeVerificationDocument({ buffer: file.buffer, size: file.size }));
        }
        storedPhoto = await imageStorage.storeListingImage({ buffer: photo.buffer, size: photo.size });
        const savedPhoto = storedPhoto;

        const result = await db.transaction(async (transaction) => {
          const [locked] = await transaction
            .select({ verificationStatus: businesses.verificationStatus })
            .from(businesses)
            .where(eq(businesses.id, business.id))
            .limit(1)
            .for('update');
          if (locked?.verificationStatus === 'pending' || locked?.verificationStatus === 'approved') {
            throw new HttpError(409, 'APPLICATION_PENDING', 'Your application is already with the admin.');
          }
          const [listing] = await transaction
            .insert(listings)
            .values({ ...listingInput, businessId: business.id, status: 'pending' })
            .returning({ id: listings.id, title: listings.title, status: listings.status });
          await transaction.insert(listingImages).values({
            listingId: listing!.id,
            storageKey: savedPhoto.storageKey,
            mimeType: savedPhoto.mimeType,
            byteSize: savedPhoto.byteSize,
            width: savedPhoto.width,
            height: savedPhoto.height,
            altText,
            sortOrder: 0,
          });
          const [submission] = await transaction
            .insert(verificationSubmissions)
            .values({ businessId: business.id, submitterId: request.auth!.id, storageKeys: storedKeys, status: 'pending' })
            .returning({ id: verificationSubmissions.id, status: verificationSubmissions.status, submittedAt: verificationSubmissions.submittedAt });
          await transaction
            .update(businesses)
            .set({ verificationStatus: 'pending', updatedAt: new Date() })
            .where(eq(businesses.id, business.id));
          await transaction.insert(auditLogs).values({
            actorId: request.auth!.id,
            action: 'application.submitted',
            targetType: 'verification_submission',
            targetId: submission!.id,
            metadata: { businessId: business.id, listingId: listing!.id, documentCount: storedKeys.length },
          });
          return { submission, listing };
        });
        response.status(201).json({ data: result });
      } catch (error) {
        await Promise.all([
          ...storedKeys.map((key) => storage.removePrivateObject(key)),
          ...(storedPhoto ? [imageStorage.removePublicImage(storedPhoto.storageKey)] : []),
        ]);
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