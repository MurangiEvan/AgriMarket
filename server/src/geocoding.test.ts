import assert from 'node:assert/strict';
import test from 'node:test';

import { clearGeocodingCacheForTests, searchLocations } from './geocoding.js';

test('location search falls back to OpenStreetMap without a Google key', async () => {
  clearGeocodingCacheForTests();
  const requested: { url: string; userAgent: string | undefined }[] = [];
  const fakeFetch = (async (url: URL, init: RequestInit) => {
    requested.push({ url: url.toString(), userAgent: (init.headers as Record<string, string>)['user-agent'] });
    return Response.json({
      features: [
        { properties: { name: 'Polokwane', city: 'Polokwane', state: 'Limpopo', countrycode: 'ZA' }, geometry: { coordinates: [29.4689, -23.9045] } },
        { properties: { name: 'Polokwane', city: 'Polokwane', state: 'Limpopo', countrycode: 'ZA' }, geometry: { coordinates: [29.47, -23.9] } },
        { properties: { name: 'Gaborone', countrycode: 'BW' }, geometry: { coordinates: [25.9, -24.6] } },
        { properties: { name: 'Broken', countrycode: 'ZA' } },
      ],
    });
  }) as typeof fetch;

  const result = await searchLocations('Polokwane', undefined, fakeFetch);

  assert.equal(requested.length, 1);
  assert.ok(requested[0]!.url.startsWith('https://photon.komoot.io/api/?'));
  assert.ok(requested[0]!.userAgent?.startsWith('AgriMarket/'));
  assert.deepEqual(result.locations, [{ label: 'Polokwane, Limpopo, South Africa', latitude: -23.9045, longitude: 29.4689 }]);
  assert.match(result.attribution, /OpenStreetMap/);

  await searchLocations('  polokwane ', undefined, fakeFetch);
  assert.equal(requested.length, 1, 'repeated searches are served from cache');
});

test('location search uses Google when a key is configured and reports provider failures', async () => {
  clearGeocodingCacheForTests();
  const googleFetch = (async () => Response.json({
    status: 'OK',
    results: [{ formatted_address: 'Durban, South Africa', geometry: { location: { lat: -29.85, lng: 31.02 } } }],
  })) as typeof fetch;
  const result = await searchLocations('Durban', 'test-key', googleFetch);
  assert.equal(result.locations[0]?.label, 'Durban, South Africa');
  assert.match(result.attribution, /Google/);

  const failingFetch = (async () => new Response('busy', { status: 503 })) as typeof fetch;
  await assert.rejects(() => searchLocations('Nowhere', undefined, failingFetch), { status: 503 });
});
