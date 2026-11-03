import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';

import type { Database } from '../db/client.js';
import { businesses, listingImages, listings } from '../db/schema.js';
import { HttpError, asyncRoute } from '../http.js';
import type { PublicImageStorage } from '../storage.js';

export function createPublicImagesRouter(db: Database, storage: PublicImageStorage): Router {
  const router = Router();
  router.get(
    '/:imageId',
    asyncRoute(async (request, response) => {
      const imageId = z.uuid().parse(request.params.imageId);
      const [image] = await db
        .select({ storageKey: listingImages.storageKey, mimeType: listingImages.mimeType })
        .from(listingImages)
        .innerJoin(listings, eq(listingImages.listingId, listings.id))
        .innerJoin(businesses, eq(listings.businessId, businesses.id))
        .where(
          and(
            eq(listingImages.id, imageId),
            eq(listings.status, 'published'),
            eq(listings.active, true),
            eq(listings.inStock, true),
            or(isNull(listings.expiresAt), gt(listings.expiresAt, new Date())),
            eq(businesses.verificationStatus, 'approved'),
          ),
        )
        .limit(1);
      if (!image) throw new HttpError(404, 'NOT_FOUND', 'The requested image was not found.');
      const content = await storage.readPublicImage(image.storageKey);
      response.set({
        'Cache-Control': 'public, max-age=604800, immutable',
        'Content-Type': image.mimeType,
        'X-Content-Type-Options': 'nosniff',
      });
      response.send(content.buffer);
    }),
  );
  return router;
}