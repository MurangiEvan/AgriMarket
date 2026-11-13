import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';

import type { Database } from '../db/client.js';
import { businesses, listingImages, listings } from '../db/schema.js';
import { HttpError, asyncRoute } from '../http.js';
import { authenticateRequest } from '../middleware/auth.js';
import type { PublicImageStorage } from '../storage.js';

export function createPublicImagesRouter(db: Database, storage: PublicImageStorage, sessionSecret: string): Router {
  const router = Router();
  router.get(
    '/:imageId',
    asyncRoute(async (request, response) => {
      const imageId = z.uuid().parse(request.params.imageId);
      const [image] = await db
        .select({
          storageKey: listingImages.storageKey,
          mimeType: listingImages.mimeType,
          ownerId: businesses.ownerId,
          status: listings.status,
          active: listings.active,
          inStock: listings.inStock,
          expiresAt: listings.expiresAt,
          verificationStatus: businesses.verificationStatus,
        })
        .from(listingImages)
        .innerJoin(listings, eq(listingImages.listingId, listings.id))
        .innerJoin(businesses, eq(listings.businessId, businesses.id))
        .where(eq(listingImages.id, imageId))
        .limit(1);
      if (!image) throw new HttpError(404, 'NOT_FOUND', 'The requested image was not found.');

      const isPublic =
        image.status === 'published' &&
        image.active &&
        image.inStock &&
        (!image.expiresAt || image.expiresAt > new Date()) &&
        image.verificationStatus === 'approved';
      if (!isPublic) {
        // Photos awaiting review are visible only to the seller who uploaded them and to admins.
        const auth = await authenticateRequest(db, sessionSecret, request);
        if (!auth || (auth.role !== 'admin' && auth.id !== image.ownerId)) {
          throw new HttpError(404, 'NOT_FOUND', 'The requested image was not found.');
        }
      }

      const content = await storage.readPublicImage(image.storageKey);
      response.set({
        'Cache-Control': isPublic ? 'public, max-age=604800, immutable' : 'private, no-store',
        'Content-Type': image.mimeType,
        'X-Content-Type-Options': 'nosniff',
        // Helmet's default (same-origin) blocks these photos whenever the app and the API run on
        // different ports, e.g. the web app on localhost:8081 and the API on localhost:4000.
        // same-site still stops other websites from embedding them.
        'Cross-Origin-Resource-Policy': 'same-site',
      });
      response.send(content.buffer);
    }),
  );
  return router;
}
