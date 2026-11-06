import { HttpError } from './http.js';

export type GeocodedLocation = {
  label: string;
  latitude: number;
  longitude: number;
};

export type LocationSearchResult = {
  locations: GeocodedLocation[];
  attribution: string;
};

type GoogleGeocodingResponse = {
  status?: string;
  results?: Array<{
    formatted_address?: string;
    geometry?: { location?: { lat?: number; lng?: number } };
  }>;
};

type PhotonResponse = {
  features?: Array<{
    properties?: {
      name?: string;
      street?: string;
      housenumber?: string;
      district?: string;
      city?: string;
      county?: string;
      state?: string;
      countrycode?: string;
    };
    geometry?: { coordinates?: [number, number] };
  }>;
};

const GOOGLE_ATTRIBUTION = 'Location results © Google Maps';
const OPENSTREETMAP_ATTRIBUTION = 'Location results © OpenStreetMap contributors (Photon)';
// Photon is a free OpenStreetMap geocoder; identify the app and keep requests to about one per second.
const PHOTON_USER_AGENT = 'AgriMarket/1.0 (+https://github.com/MurangiEvan/AgriMarket)';
const PHOTON_MIN_INTERVAL_MS = 1100;
const SOUTH_AFRICA_BBOX = '16.3,-35,33,-22';

const cache = new Map<string, { expiresAt: number; result: LocationSearchResult }>();
const cacheTtlMs = 24 * 60 * 60 * 1000;
const cacheLimit = 500;
let photonQueue: Promise<unknown> = Promise.resolve();
let photonLastRequestAt = 0;

export async function searchLocations(
  query: string,
  googleApiKey: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<LocationSearchResult> {
  const normalizedQuery = query.trim().replace(/\s+/g, ' ').toLowerCase();
  const cacheKey = `${googleApiKey ? 'google' : 'osm'}:${normalizedQuery}`;

  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.result;
  if (cached) cache.delete(cacheKey);

  const result: LocationSearchResult = googleApiKey
    ? { locations: await searchGoogle(query, googleApiKey, fetchImpl), attribution: GOOGLE_ATTRIBUTION }
    : { locations: await searchOpenStreetMap(query, fetchImpl), attribution: OPENSTREETMAP_ATTRIBUTION };

  if (cache.size >= cacheLimit) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(cacheKey, { expiresAt: Date.now() + cacheTtlMs, result });
  return result;
}

async function searchGoogle(query: string, apiKey: string, fetchImpl: typeof fetch): Promise<GeocodedLocation[]> {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', query.trim());
  url.searchParams.set('components', 'country:ZA');
  url.searchParams.set('region', 'za');
  url.searchParams.set('key', apiKey);

  const result = await fetchJson<GoogleGeocodingResponse>(url, {}, fetchImpl);
  if (result.status !== 'OK' && result.status !== 'ZERO_RESULTS') throw unavailable();

  return validLocations(
    (result.results ?? []).map((item) => ({
      label: item.formatted_address ?? '',
      latitude: item.geometry?.location?.lat,
      longitude: item.geometry?.location?.lng,
    })),
  );
}

async function searchOpenStreetMap(query: string, fetchImpl: typeof fetch): Promise<GeocodedLocation[]> {
  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.set('q', query.trim());
  url.searchParams.set('lang', 'en');
  url.searchParams.set('limit', '10');
  url.searchParams.set('bbox', SOUTH_AFRICA_BBOX);

  const run = async () => {
    const wait = photonLastRequestAt + PHOTON_MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    photonLastRequestAt = Date.now();
    return fetchJson<PhotonResponse>(url, { headers: { 'user-agent': PHOTON_USER_AGENT } }, fetchImpl);
  };
  const pending = photonQueue.then(run, run);
  photonQueue = pending.catch(() => undefined);
  const response = await pending;
  if (!Array.isArray(response.features)) throw unavailable();

  const seen = new Set<string>();
  return validLocations(
    response.features
      .filter((feature) => feature.properties?.countrycode === 'ZA')
      .map((feature) => {
        const properties = feature.properties ?? {};
        const street = [properties.housenumber, properties.street].filter(Boolean).join(' ');
        const parts = [properties.name, street, properties.district, properties.city, properties.county, properties.state, 'South Africa'];
        const label = parts.filter((part, index): part is string => Boolean(part) && parts.indexOf(part) === index).join(', ');
        return { label, longitude: feature.geometry?.coordinates?.[0], latitude: feature.geometry?.coordinates?.[1] };
      })
      .filter((item) => !seen.has(item.label) && Boolean(seen.add(item.label))),
  );
}

async function fetchJson<T>(url: URL, init: RequestInit, fetchImpl: typeof fetch): Promise<T> {
  let response: Response;
  try {
    response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(8000) });
  } catch {
    throw unavailable();
  }
  if (!response.ok) throw unavailable();
  try {
    return await response.json() as T;
  } catch {
    throw unavailable();
  }
}

function validLocations(items: Array<{ label: string; latitude?: number; longitude?: number }>): GeocodedLocation[] {
  return items
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
}

function unavailable() {
  return new HttpError(503, 'LOCATION_SEARCH_UNAVAILABLE', 'Location search is temporarily unavailable.');
}

export function clearGeocodingCacheForTests() {
  cache.clear();
}
