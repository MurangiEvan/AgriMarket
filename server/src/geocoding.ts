import { HttpError } from './http.js';

export type GeocodedLocation = {
  label: string;
  latitude: number;
  longitude: number;
};

type GoogleGeocodingResponse = {
  status?: string;
  results?: Array<{
    formatted_address?: string;
    geometry?: { location?: { lat?: number; lng?: number } };
  }>;
};

const cache = new Map<string, { expiresAt: number; locations: GeocodedLocation[] }>();
const cacheTtlMs = 24 * 60 * 60 * 1000;
const cacheLimit = 500;

export async function searchLocations(query: string, apiKey: string | undefined): Promise<GeocodedLocation[]> {
  const normalizedQuery = query.trim().replace(/\s+/g, ' ').toLowerCase();
  if (!apiKey) throw new HttpError(503, 'LOCATION_SEARCH_UNAVAILABLE', 'Location search is not configured.');

  const cached = cache.get(normalizedQuery);
  if (cached && cached.expiresAt > Date.now()) return cached.locations;
  if (cached) cache.delete(normalizedQuery);

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', query.trim());
  url.searchParams.set('components', 'country:ZA');
  url.searchParams.set('region', 'za');
  url.searchParams.set('key', apiKey);

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  } catch {
    throw new HttpError(503, 'LOCATION_SEARCH_UNAVAILABLE', 'Location search is temporarily unavailable.');
  }

  let result: GoogleGeocodingResponse;
  try {
    result = await response.json() as GoogleGeocodingResponse;
  } catch {
    throw new HttpError(503, 'LOCATION_SEARCH_UNAVAILABLE', 'Location search is temporarily unavailable.');
  }

  if (!response.ok || (result.status !== 'OK' && result.status !== 'ZERO_RESULTS')) {
    throw new HttpError(503, 'LOCATION_SEARCH_UNAVAILABLE', 'Location search is temporarily unavailable.');
  }

  const locations = (result.results ?? [])
    .map((item) => ({
      label: item.formatted_address ?? '',
      latitude: item.geometry?.location?.lat,
      longitude: item.geometry?.location?.lng,
    }))
    .filter(
      (item): item is GeocodedLocation =>
        item.label.length > 0 &&
        typeof item.latitude === 'number' &&
        Number.isFinite(item.latitude) &&
        item.latitude >= -90 &&
        item.latitude <= 90 &&
        typeof item.longitude === 'number' &&
        Number.isFinite(item.longitude) &&
        item.longitude >= -180 &&
        item.longitude <= 180,
    )
    .slice(0, 5);

  if (cache.size >= cacheLimit) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(normalizedQuery, { expiresAt: Date.now() + cacheTtlMs, locations });
  return locations;
}

export function clearGeocodingCacheForTests() {
  cache.clear();
}
