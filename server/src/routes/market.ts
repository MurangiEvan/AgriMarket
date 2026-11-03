import { and, asc, count, eq, gte, gt, ilike, isNull, lte, min, or, sql } from 'drizzle-orm';
import { Router } from 'express';

import type { Database } from '../db/client.js';
import { businesses, categories, listings, produceTypes } from '../db/schema.js';
import { asyncRoute, HttpError } from '../http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { marketProduceQuerySchema } from '../validation.js';

export function createMarketRouter(db: Database, sessionSecret: string): Router {
  const router = Router();
  router.use(requireAuth(db, sessionSecret), requireRole('buyer'));

  router.get(
    '/categories',
    asyncRoute(async (_request, response) => {
      let result;
      try {
        result = await db
          .selectDistinct({ id: categories.id, slug: categories.slug, name: categories.name })
          .from(categories)
          .innerJoin(produceTypes, eq(produceTypes.categoryId, categories.id))
          .where(and(eq(categories.isActive, true), eq(produceTypes.active, true)))
          .orderBy(asc(categories.name));
      } catch (cause) {
        throw marketCatalogueError(cause);
      }
      response.json({ data: result });
    }),
  );

  router.get(
    '/produce',
    asyncRoute(async (request, response) => {
      const query = marketProduceQuerySchema.parse(request.query);
      const [category] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.id, query.categoryId), eq(categories.isActive, true)))
        .limit(1);
      if (!category) {
        response.status(400).json({
          error: { code: 'INVALID_CATEGORY', message: 'Choose an active market category.', details: [] },
        });
        return;
      }

      const latitudeDelta = query.radiusKm / 110.574;
      const longitudeDelta = Math.min(
        180,
        query.radiusKm / (111.32 * Math.max(0.01, Math.abs(Math.cos((query.lat * Math.PI) / 180)))),
      );
      const minLongitude = query.lng - longitudeDelta;
      const maxLongitude = query.lng + longitudeDelta;
      const longitudeBounds =
        minLongitude < -180
          ? or(gte(businesses.longitude, minLongitude + 360), lte(businesses.longitude, maxLongitude))!
          : maxLongitude > 180
            ? or(gte(businesses.longitude, minLongitude), lte(businesses.longitude, maxLongitude - 360))!
            : and(gte(businesses.longitude, minLongitude), lte(businesses.longitude, maxLongitude))!;
      const latitudeBounds = and(
        gte(businesses.latitude, query.lat - latitudeDelta),
        lte(businesses.latitude, query.lat + latitudeDelta),
      )!;
      const distanceKm = sql<number>`6371 * 2 * asin(sqrt(least(1,
        power(sin(radians(${businesses.latitude} - ${query.lat}) / 2), 2) +
        cos(radians(${query.lat})) * cos(radians(${businesses.latitude})) *
        power(sin(radians(${businesses.longitude} - ${query.lng}) / 2), 2)
      )))`;
      const conditions = [
        eq(produceTypes.categoryId, query.categoryId),
        eq(produceTypes.active, true),
        eq(categories.isActive, true),
      ];
      if (query.q) conditions.push(ilike(produceTypes.name, `%${escapeLike(query.q)}%`));
      const now = new Date();
      let rows;
      try {
        rows = await db
          .select({
            id: produceTypes.id,
            name: produceTypes.name,
            listingCount: count(businesses.id),
            nearestDistanceKm: min(distanceKm),
          })
          .from(produceTypes)
          .innerJoin(categories, eq(categories.id, produceTypes.categoryId))
          .leftJoin(
            listings,
            and(
              eq(listings.produceTypeId, produceTypes.id),
              eq(listings.status, 'published'),
              eq(listings.type, 'product'),
              eq(listings.active, true),
              eq(listings.inStock, true),
              or(isNull(listings.expiresAt), gt(listings.expiresAt, now)),
            ),
          )
          .leftJoin(
            businesses,
            and(
              eq(businesses.id, listings.businessId),
              eq(businesses.verificationStatus, 'approved'),
              latitudeBounds,
              longitudeBounds,
              sql`${distanceKm} <= ${query.radiusKm}`,
            ),
          )
          .where(and(...conditions))
          .groupBy(produceTypes.id, produceTypes.name)
          .orderBy(asc(produceTypes.name));
      } catch (cause) {
        throw marketCatalogueError(cause);
      }

      response.json({
        data: rows.map(mapMarketProduceRow),
      });
    }),
  );

  return router;
}

export function marketCatalogueError(cause: unknown): unknown {
  if (postgresErrorCode(cause) === '42P01') {
    return new HttpError(
      503,
      'MARKET_CATALOGUE_NOT_READY',
      'Market categories are not installed yet. Apply the database migrations and seed the catalogue.',
    );
  }
  return cause;
}

function postgresErrorCode(error: unknown): string | undefined {
  const seen = new Set<object>();
  let current = error;
  while (typeof current === 'object' && current !== null && !seen.has(current)) {
    seen.add(current);
    if ('code' in current && typeof current.code === 'string') return current.code;
    current = 'cause' in current ? current.cause : null;
  }
  return undefined;
}

export function mapMarketProduceRow(row: {
  id: string;
  name: string;
  listingCount: number | string;
  nearestDistanceKm: number | string | null;
}) {
  const listingCount = Number(row.listingCount);
  const nearestDistance = row.nearestDistanceKm === null ? null : Number(row.nearestDistanceKm);
  return {
    id: row.id,
    name: row.name,
    available: listingCount > 0,
    listingCount,
    nearestKmRounded: nearestDistance === null ? null : Math.round(nearestDistance),
  };
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, '\\$&');
}
