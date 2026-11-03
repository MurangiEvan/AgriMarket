import { roundCoordinate } from './market-flow';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '');
const REFRESH_TOKEN_KEY = 'agrimarket-refresh-token';
let accessToken: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;
let authExpiredHandler: (() => void) | null = null;

export type Category = { id: string; slug: string; name: string };
export type MarketProduce = {
  id: string;
  name: string;
  available: boolean;
  listingCount: number;
  nearestKmRounded: number | null;
};
export type BuyerLocation = { label: string; latitude: number; longitude: number };
export type LocationCandidate = BuyerLocation;
export type SellerProduceType = { id: string; categoryId: string; name: string };

export type ListingSummary = {
  id: string;
  title: string;
  description: string;
  province: string;
  town: string | null;
  type: 'product' | 'service';
  verified: boolean;
  businessId: string;
  businessName: string;
  categorySlug: string;
  categoryName: string;
  image: { id: string; altText: string; url: string } | null;
};

export type ListingDetail = ListingSummary & {
  businessDescription: string;
  businessProvince: string;
  businessTown: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  whatsappPhone: string | null;
  images: { id: string; altText: string; sortOrder: number; url: string }[];
};

export type PublicBusiness = {
  id: string;
  name: string;
  description: string;
  province: string;
  town: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  whatsappPhone: string | null;
  verified: boolean;
};

export function apiResourceUrl(path: string): string {
  return `${API_BASE_URL.replace(/\/api\/v1\/?$/, '')}${path}`;
}

export type SessionUser = {
  id: string;
  email: string;
  role: 'buyer' | 'seller' | 'admin';
  emailVerifiedAt?: string | null;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
  ) {
    super(message);
  }
}

export function registerAuthExpiredHandler(handler: () => void) {
  authExpiredHandler = handler;
  return () => {
    if (authExpiredHandler === handler) authExpiredHandler = null;
  };
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await performRequest(path, init);
  if (response.status === 401 && !isAuthEntryPath(path)) {
    if (await hasRefreshCredential()) {
      const refreshed = await refreshSession();
      if (refreshed) {
        const retry = await performRequest(path, init);
        if (retry.status !== 401) return parseResponse<T>(retry);
      }
      await clearNativeRefreshToken();
      accessToken = null;
      authExpiredHandler?.();
    }
  }
  return parseResponse<T>(response);
}

async function performRequest(path: string, init: RequestInit): Promise<Response> {
  ensureSecureApi();
  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(Platform.OS !== 'web' ? { 'X-AgriMarket-Client': 'native' } : {}),
        ...(Platform.OS !== 'web' && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError('AgriMarket could not reach the service. Check your connection and try again.');
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const body = (await response.json().catch(() => null)) as {
    data?: T;
    error?: { message?: string; code?: string };
  } | null;
  if (!response.ok) {
    throw new ApiError(body?.error?.message ?? 'The request could not be completed.', response.status, body?.error?.code);
  }
  return body?.data as T;
}

function isAuthEntryPath(path: string) {
  return ['/auth/login', '/auth/register', '/auth/refresh'].some((entry) => path.startsWith(entry));
}

async function hasRefreshCredential() {
  if (Platform.OS !== 'web') return Boolean(await SecureStore.getItemAsync(REFRESH_TOKEN_KEY));
  return Boolean(await AsyncStorage.getItem('agrimarket-last-role'));
}

async function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    ensureSecureApi();
    let refreshToken: string | undefined;
    if (Platform.OS !== 'web') {
      refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY) ?? undefined;
      if (!refreshToken) return false;
    }

    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(Platform.OS !== 'web' ? { 'X-AgriMarket-Client': 'native' } : {}),
        },
        ...(refreshToken ? { body: JSON.stringify({ refreshToken }) } : { body: '{}' }),
      });
    } catch {
      return false;
    }
    if (!response.ok) return false;
    const body = await response.json() as { data?: { accessToken?: string; refreshToken?: string } };
    if (Platform.OS !== 'web') {
      if (!body.data?.accessToken || !body.data.refreshToken) return false;
      accessToken = body.data.accessToken;
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, body.data.refreshToken);
    }
    return true;
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function clearNativeRefreshToken() {
  if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

export async function getCategories(): Promise<Category[]> {
  return apiRequest<Category[]>('/categories');
}

export async function getMarketCategories(): Promise<Category[]> {
  return apiRequest<Category[]>('/market/categories');
}

export async function getMarketProduce(filters: {
  categoryId: string;
  radiusKm: number;
  latitude: number;
  longitude: number;
  q?: string;
}) {
  ensureSecureLocationApi();
  const query = new URLSearchParams({
    categoryId: filters.categoryId,
    radiusKm: String(filters.radiusKm),
    lat: String(roundCoordinate(filters.latitude)),
    lng: String(roundCoordinate(filters.longitude)),
  });
  if (filters.q) query.set('q', filters.q);
  return apiRequest<MarketProduce[]>(`/market/produce?${query.toString()}`);
}

export async function getBuyerLocation() {
  ensureSecureLocationApi();
  return apiRequest<{ location: BuyerLocation | null }>('/buyer/location');
}

export async function searchBuyerLocations(queryText: string) {
  ensureSecureLocationApi();
  const query = new URLSearchParams({ q: queryText });
  return apiRequest<{ locations: LocationCandidate[] }>(`/buyer/location/search?${query.toString()}`);
}

export async function saveBuyerLocation(location: BuyerLocation) {
  ensureSecureLocationApi();
  return apiRequest<{ location: BuyerLocation }>('/buyer/location', {
    method: 'PUT',
    body: JSON.stringify(location),
  });
}

export async function getSellerProduceTypes(categoryId: string) {
  const query = new URLSearchParams({ categoryId });
  return apiRequest<SellerProduceType[]>(`/seller/produce-types?${query.toString()}`);
}

function ensureSecureLocationApi() {
  ensureSecureApi('Nearby search requires a secure HTTPS connection.');
}

function ensureSecureApi(message = 'AgriMarket account and data requests require a secure HTTPS connection.') {
  const apiUrl = new URL(API_BASE_URL);
  const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(apiUrl.hostname);
  if (apiUrl.protocol !== 'https:' && !localHost) {
    throw new ApiError(message);
  }
}

export async function getListings(filters: { q?: string; category?: string; produceTypeId?: string; province?: string; cursor?: string } = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) query.set(key, value);
  }
  const suffix = query.size ? `?${query.toString()}` : '';
  return apiRequest<{ items: ListingSummary[]; page: { nextCursor: string | null } }>(`/listings${suffix}`);
}

export async function getListing(id: string) {
  return apiRequest<{ listing: ListingDetail; business: PublicBusiness }>(`/listings/${encodeURIComponent(id)}`);
}

export async function getCurrentUser(): Promise<SessionUser> {
  const result = await apiRequest<{ user: SessionUser }>('/auth/me');
  return result.user;
}

export async function signIn(email: string, password: string): Promise<SessionUser> {
  const result = await apiRequest<{ user: SessionUser; accessToken?: string; refreshToken?: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  await saveNativeCredentials(result);
  return result.user;
}

export async function register(email: string, password: string, role: 'buyer' | 'seller'): Promise<SessionUser> {
  const result = await apiRequest<{ user: SessionUser; accessToken?: string; refreshToken?: string }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, role }),
  });
  await saveNativeCredentials(result);
  return result.user;
}

async function saveNativeCredentials(result: { accessToken?: string; refreshToken?: string }) {
  if (Platform.OS !== 'web') {
    if (!result.accessToken || !result.refreshToken) throw new ApiError('The sign-in response was incomplete.');
    accessToken = result.accessToken;
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, result.refreshToken);
  }
}

export async function signOut(): Promise<void> {
  await apiRequest('/auth/logout', { method: 'POST' });
  accessToken = null;
  await clearNativeRefreshToken();
}