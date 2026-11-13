import { and, desc, eq, gt, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';

import type { Database } from '../db/client.js';
import { businesses, categories, listingImages, listings } from '../db/schema.js';
import { HttpError, asyncRoute } from '../http.js';
import { normalizeSouthAfricanPhone } from '../policies.js';
import { publicListingQuerySchema } from '../validation.js';

const decodedCursorSchema = z.object({ createdAt: z.iso.datetime(), id: z.uuid() });

export function createListingsRouter(db: Database): Router {
  const router = Router();

  router.get(
    '/',
    asyncRoute(async (request, response) => {
      const query = publicListingQuerySchema.parse(request.query);
      const cursor = query.cursor ? decodeCursor(query.cursor) : null;
      const conditions = [
        eq(listings.status, 'published'),
        eq(listings.active, true),
        eq(listings.inStock, true),
        or(isNull(listings.expiresAt), gt(listings.expiresAt, new Date()))!,
        eq(businesses.verificationStatus, 'approved'),
      ];
      if (query.province) conditions.push(eq(listings.province, query.province));
      if (query.category) conditions.push(eq(categories.slug, query.category));
      if (query.produceTypeId) conditions.push(eq(listings.produceTypeId, query.produceTypeId));
      if (query.agriseta) conditions.push(eq(businesses.agrisetaSupported, true));
      if (cursor) {
        const cursorDate = new Date(cursor.createdAt);
        conditions.push(
          or(lt(listings.createdAt, cursorDate), and(eq(listings.createdAt, cursorDate), lt(listings.id, cursor.id)))!,
        );
      }
      if (query.q) {
        const search = sql`websearch_to_tsquery('simple', ${query.q})`;
        conditions.push(
          or(
            sql`to_tsvector('simple', ${listings.title} || ' ' || ${listings.description}) @@ ${search}`,
            sql`to_tsvector('simple', ${businesses.name}) @@ ${search}`,
          )!,
        );
      }

      const rows = await db
        .select({
          id: listings.id,
          title: listings.title,
          description: listings.description,
          province: listings.province,
          town: listings.town,
          type: listings.type,
          createdAt: listings.createdAt,
          businessId: businesses.id,
          businessName: businesses.name,
          agrisetaSupported: businesses.agrisetaSupported,
          categorySlug: categories.slug,
          categoryName: categories.name,
        })
        .from(listings)
        .innerJoin(businesses, eq(listings.businessId, businesses.id))
        .innerJoin(categories, eq(listings.categoryId, categories.id))
        .where(and(...conditions))
        .orderBy(desc(listings.createdAt), desc(listings.id))
        .limit(query.limit + 1);

      const hasMore = rows.length > query.limit;
      const pageRows = rows.slice(0, query.limit);
      const last = pageRows.at(-1);
      const images = pageRows.length
        ? await db
            .select({ id: listingImages.id, listingId: listingImages.listingId, altText: listingImages.altText, sortOrder: listingImages.sortOrder })
            .from(listingImages)
            .where(inArray(listingImages.listingId, pageRows.map((row) => row.id)))
            .orderBy(listingImages.sortOrder)
        : [];
      const firstImage = new Map<string, (typeof images)[number]>();
      for (const image of images) if (!firstImage.has(image.listingId)) firstImage.set(image.listingId, image);
      response.json({
        data: {
          items: pageRows.map((row) => {
            const image = firstImage.get(row.id);
            return {
              ...row,
              verified: true,
              image: image ? { id: image.id, altText: image.altText, url: `/api/v1/media/listings/${image.id}` } : null,
            };
          }),
          page: { nextCursor: hasMore && last ? encodeCursor(last.createdAt.toISOString(), last.id) : null },
        },
      });
    }),
  );

  router.get(
    '/:listingId',
    asyncRoute(async (request, response) => {
      const listingId = z.uuid().parse(request.params.listingId);
      const [row] = await db
        .select({
          id: listings.id,
          title: listings.title,
          description: listings.description,
          province: listings.province,
          town: listings.town,
          type: listings.type,
          createdAt: listings.createdAt,
          businessId: businesses.id,
          businessName: businesses.name,
          agrisetaSupported: businesses.agrisetaSupported,
          businessDescription: businesses.description,
          businessProvince: businesses.province,
          businessTown: businesses.town,
          contactEmail: businesses.contactEmail,
          contactPhone: businesses.contactPhone,
          whatsappPhone: businesses.whatsappPhone,
          categorySlug: categories.slug,
          categoryName: categories.name,
        })
        .from(listings)
        .innerJoin(businesses, eq(listings.businessId, businesses.id))
        .innerJoin(categories, eq(listings.categoryId, categories.id))
        .where(
          and(
            eq(listings.id, listingId),
            eq(listings.status, 'published'),
            eq(listings.active, true),
            eq(listings.inStock, true),
            or(isNull(listings.expiresAt), gt(listings.expiresAt, new Date())),
            eq(businesses.verificationStatus, 'approved'),
          ),
        )
        .limit(1);

      if (!row) throw new HttpError(404, 'NOT_FOUND', 'The requested listing was not found.');
      const images = await db
        .select({ id: listingImages.id, altText: listingImages.altText, sortOrder: listingImages.sortOrder })
        .from(listingImages)
        .where(eq(listingImages.listingId, listingId))
        .orderBy(listingImages.sortOrder);

      response.json({
        data: {
          listing: {
            ...row,
            verified: true,
            images: images.map((image) => ({ ...image, url: `/api/v1/media/listings/${image.id}` })),
          },
          business: {
            id: row.businessId,
            name: row.businessName,
            description: row.businessDescription,
            province: row.businessProvince,
            town: row.businessTown,
            contactEmail: row.contactEmail,
            contactPhone: normalizeSouthAfricanPhone(row.contactPhone),
            whatsappPhone: normalizeSouthAfricanPhone(row.whatsappPhone),
            verified: true,
            agrisetaSupported: row.agrisetaSupported,
          },
        },
      });
    }),
  );

  return router;
}

function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt, id })).toString('base64url');
}

function decodeCursor(cursor: string): z.infer<typeof decodedCursorSchema> {
  try {
    return decodedCursorSchema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
  } catch {
    throw new HttpError(400, 'INVALID_CURSOR', 'The listing cursor is invalid.');
  }
}