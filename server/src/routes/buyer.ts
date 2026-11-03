import { and, eq } from 'drizzle-orm';
import { Router } from 'express';

import type { Database } from '../db/client.js';
import { users } from '../db/schema.js';
import { searchLocations } from '../geocoding.js';
import { asyncRoute } from '../http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { locationSearchQuerySchema, savedLocationSchema } from '../validation.js';

export function createBuyerRouter(db: Database, sessionSecret: string, googleMapsApiKey?: string): Router {
  const router = Router();
  router.use(requireAuth(db, sessionSecret), requireRole('buyer'));

  router.get(
    '/location',
    asyncRoute(async (request, response) => {
      const [user] = await db
        .select({
          label: users.locationLabel,
          latitude: users.locationLatitude,
          longitude: users.locationLongitude,
        })
        .from(users)
        .where(and(eq(users.id, request.auth!.id), eq(users.role, 'buyer')))
        .limit(1);
      response.json({
        data: {
          location:
            user?.label && user.latitude !== null && user.longitude !== null
              ? { label: user.label, latitude: user.latitude, longitude: user.longitude }
              : null,
        },
      });
    }),
  );

  router.get(
    '/location/search',
    asyncRoute(async (request, response) => {
      const query = locationSearchQuerySchema.parse(request.query);
      const locations = await searchLocations(query.q, googleMapsApiKey);
      response.json({ data: { locations } });
    }),
  );

  router.put(
    '/location',
    asyncRoute(async (request, response) => {
      const input = savedLocationSchema.parse(request.body);
      const [location] = await db
        .update(users)
        .set({
          locationLabel: input.label,
          locationLatitude: input.latitude,
          locationLongitude: input.longitude,
          updatedAt: new Date(),
        })
        .where(and(eq(users.id, request.auth!.id), eq(users.role, 'buyer')))
        .returning({
          label: users.locationLabel,
          latitude: users.locationLatitude,
          longitude: users.locationLongitude,
        });
      response.json({ data: { location } });
    }),
  );

  router.delete(
    '/location',
    asyncRoute(async (request, response) => {
      await db
        .update(users)
        .set({ locationLabel: null, locationLatitude: null, locationLongitude: null, updatedAt: new Date() })
        .where(and(eq(users.id, request.auth!.id), eq(users.role, 'buyer')));
      response.status(204).end();
    }),
  );

  return router;
}
