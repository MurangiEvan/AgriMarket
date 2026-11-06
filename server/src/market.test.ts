import assert from 'node:assert/strict';
import test from 'node:test';

import { isRoleAllowed, isTrustedOrigin } from './middleware/auth.js';
import { RADIUS_OPTIONS_KM } from './market.js';
import { HttpError } from './http.js';
import { mapMarketProduceRow, marketCatalogueError } from './routes/market.js';
import { marketProduceQuerySchema, savedLocationSchema } from './validation.js';

const validQuery = {
  categoryId: '00000000-0000-4000-8000-000000000001',
  radiusKm: '10',
  lat: '-25.7479',
  lng: '28.2293',
};

test('market radius validation accepts only configured radius choices', () => {
  assert.deepEqual(RADIUS_OPTIONS_KM, [5, 10, 15, 20, 25, 30, 40, 50]);
  assert.equal(marketProduceQuerySchema.safeParse(validQuery).success, true);
  assert.equal(marketProduceQuerySchema.safeParse({ ...validQuery, radiusKm: '12' }).success, false);
  assert.equal(marketProduceQuerySchema.safeParse({ ...validQuery, q: 'x'.repeat(81) }).success, false);
});

test('market location inputs reject coordinates outside valid ranges', () => {
  assert.equal(marketProduceQuerySchema.safeParse({ ...validQuery, lat: '90.1' }).success, false);
  assert.equal(marketProduceQuerySchema.safeParse({ ...validQuery, lng: '-180.1' }).success, false);
  assert.equal(
    savedLocationSchema.safeParse({ label: 'Pretoria', latitude: -25.7, longitude: 181 }).success,
    false,
  );
});

test('market results expose rounded distance and never expose coordinates', () => {
  const result = mapMarketProduceRow({
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Tomatoes',
    listingCount: '2',
    nearestDistanceKm: '3.2',
  });
  assert.deepEqual(result, {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Tomatoes',
    available: true,
    listingCount: 2,
    nearestKmRounded: 3,
  });
  assert.equal('latitude' in result, false);
  assert.equal('longitude' in result, false);
});

test('produce with no in-radius listings is unavailable and has no nearest distance', () => {
  assert.deepEqual(
    mapMarketProduceRow({
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Tomatoes',
      listingCount: '0',
      nearestDistanceKm: null,
    }),
    {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Tomatoes',
      available: false,
      listingCount: 0,
      nearestKmRounded: null,
    },
  );
});

test('an unapplied produce catalogue migration returns a clear service-unavailable error', () => {
  const missingTable = { cause: { code: '42P01' } };
  const error = marketCatalogueError(missingTable);
  assert.ok(error instanceof HttpError);
  assert.equal(error.status, 503);
  assert.equal(error.code, 'MARKET_CATALOGUE_NOT_READY');
  const unrelatedError = { cause: { code: '08006' } };
  assert.equal(marketCatalogueError(unrelatedError), unrelatedError);
});

test('only buyer role is allowed by the market and profile role guard', () => {
  assert.equal(isRoleAllowed('buyer', ['buyer']), true);
  assert.equal(isRoleAllowed('seller', ['buyer']), false);
  assert.equal(isRoleAllowed('admin', ['buyer']), false);
});

test('local development origins are accepted only in development', () => {
  const configuredOrigins = new Set(['http://localhost:8081']);
  assert.equal(isTrustedOrigin('http://localhost:4173', configuredOrigins, true), true);
  assert.equal(isTrustedOrigin('http://127.0.0.1:9011', configuredOrigins, true), true);
  assert.equal(isTrustedOrigin('http://192.168.137.68:4173', configuredOrigins, true), true);
  assert.equal(isTrustedOrigin('http://10.1.2.3:8081', configuredOrigins, true), true);
  assert.equal(isTrustedOrigin('http://172.31.2.3:8081', configuredOrigins, true), true);
  assert.equal(isTrustedOrigin('http://172.32.2.3:8081', configuredOrigins, true), false);
  assert.equal(isTrustedOrigin('http://8.8.8.8:8081', configuredOrigins, true), false);
  assert.equal(isTrustedOrigin('http://attacker.example:8081', configuredOrigins, true), false);
  assert.equal(isTrustedOrigin('http://localhost:4173', configuredOrigins), false);
  assert.equal(isTrustedOrigin('http://192.168.137.68:4173', configuredOrigins), false);
  assert.equal(isTrustedOrigin('https://localhost:4173', configuredOrigins, true), false);
  assert.equal(isTrustedOrigin('https://evil.example', configuredOrigins, true), false);
  assert.equal(isTrustedOrigin('null', configuredOrigins, true), false);
});
