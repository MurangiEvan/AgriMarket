import { roundCoordinate } from './market-flow';
import { unreachableMessage } from './network-errors';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

// Without EXPO_PUBLIC_API_URL the web build talks to the server it was loaded from (production on Render).
const API_BASE_URL = resolveApiBaseUrl(
  (
    process.env.EXPO_PUBLIC_API_URL ||
    (Platform.OS === 'web' && typeof window !== 'undefined' ? `${window.location.origin}/api/v1` : 'http://localhost:4000/api/v1')
  ).replace(/\/$/, ''),
);
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
  agrisetaSupported: boolean;
  categorySlug: string;
  categoryName: string;
  image: { id: string; altText: string; url: string } | null;
  // True when an administrator has checked the business's SACAA drone licence.
  droneLicenceVerified?: boolean;
  // Buyers' star ratings of the business. The average stays null until enough ratings exist.
  ratingCount?: number;
  ratingAverage?: number | null;
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
  agrisetaSupported: boolean;
  droneLicenceVerified?: boolean;
  ratingCount?: number;
  ratingAverage?: number | null;
};

// An approved buyer comment shown on a listing page; buyers are named by organisation type only.
export type PublicReview = { id: string; stars: number; comment: string; buyerType: string | null; createdAt: string };

// In local development the computer's LAN address changes with the network, so follow the host the app
// was actually loaded from instead of a fixed IP in .env:
// - web: the page's host (also keeps SameSite=Lax session cookies same-site)
// - phone: the Expo dev server host the phone is already connected to
function resolveApiBaseUrl(configured: string): string {
  const devHost =
    Platform.OS === 'web'
      ? (typeof window === 'undefined' ? undefined : window.location.hostname)
      : Constants.expoConfig?.hostUri?.split(':')[0];
  if (!devHost) return configured;
  try {
    const api = new URL(configured);
    if (api.hostname !== devHost && isLocalDevelopmentHost(api.hostname) && isLocalDevelopmentHost(devHost)) {
      api.hostname = devHost;
      return api.toString().replace(/\/$/, '');
    }
  } catch {
    // Fall back to the configured URL.
  }
  return configured;
}

function isLocalDevelopmentHost(hostname: string) {
  if (['localhost', '127.0.0.1', '[::1]'].includes(hostname)) return true;
  const [a, b] = hostname.split('.').map(Number);
  return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

export function apiResourceUrl(path: string): string {
  return `${API_BASE_URL.replace(/\/api\/v1\/?$/, '')}${path}`;
}

export type SessionUser = {
  id: string;
  email: string;
  role: 'buyer' | 'seller' | 'admin';
  emailVerifiedAt?: string | null;
  // False when the user has not accepted the current Privacy notice and Terms yet.
  privacyAccepted?: boolean;
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

// Slow mobile uplinks can need several minutes for a few documents.
const UPLOAD_TIMEOUT_MS = 240_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The hosted server sleeps when idle and takes up to a minute to wake. Sending a large upload
// while it is waking can fail, so wake it (and refresh the sign-in) before uploading.
export async function prepareForUpload(): Promise<void> {
  const deadline = Date.now() + 75_000;
  for (;;) {
    try {
      const response = await fetch(`${API_BASE_URL}/health/ready`, { cache: 'no-store' });
      if (response.ok) break;
    } catch {
      // Not reachable yet; keep trying until the deadline.
    }
    if (Date.now() > deadline) throw new ApiError(unreachableMessage(false, API_BASE_URL));
    await sleep(3000);
  }
  // A cheap signed-in request: refreshes an expired access token before the big upload.
  await apiRequest('/auth/me');
}

// Sends a multipart upload, retrying when the connection drops (not when the server answers
// with an error). buildForm is called for every attempt so each one gets a fresh form.
export async function uploadWithRetry<T>(
  path: string,
  buildForm: () => FormData,
  options: { attempts?: number; alreadyDoneCodes?: string[] } = {},
): Promise<T | undefined> {
  const attempts = options.attempts ?? 3;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await apiRequest<T>(path, { method: 'POST', body: buildForm() });
    } catch (cause) {
      const connectionLost = cause instanceof ApiError && cause.code === 'NETWORK_ERROR';
      // If an earlier attempt reached the server but its reply was lost, the server now says
      // it is already done; treat that as success instead of showing an error.
      if (attempt > 1 && cause instanceof ApiError && cause.code && options.alreadyDoneCodes?.includes(cause.code)) return undefined;
      if (!connectionLost || attempt >= attempts) throw cause;
      await sleep(attempt * 4000);
      await prepareForUpload().catch(() => undefined);
    }
  }
}

async function performRequest(path: string, init: RequestInit): Promise<Response> {
  ensureSecureApi();
  // Uploads get a time limit so a stalled connection ends with a clear message instead of spinning forever.
  const upload = init.body instanceof FormData;
  const controller = upload && !init.signal ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS) : null;
  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      ...(controller ? { signal: controller.signal } : {}),
      credentials: 'include',
      headers: {
        ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(Platform.OS !== 'web' ? { 'X-AgriMarket-Client': 'native' } : {}),
        ...(Platform.OS !== 'web' && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    if (controller?.signal.aborted) {
      throw new ApiError('The upload is taking too long. Check your internet connection and try again, or choose a smaller file.', undefined, 'UPLOAD_TIMEOUT');
    }
    throw new ApiError(unreachableMessage(upload, API_BASE_URL), undefined, 'NETWORK_ERROR');
  } finally {
    if (timer) clearTimeout(timer);
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
  return ['/auth/login', '/auth/register', '/auth/refresh', '/auth/password-reset'].some((entry) => path.startsWith(entry));
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
  return apiRequest<{ locations: LocationCandidate[]; attribution?: string }>(`/buyer/location/search?${query.toString()}`);
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
  const loopbackHost = ['localhost', '127.0.0.1', '[::1]'].includes(apiUrl.hostname);
  const localDevelopmentHost = loopbackHost || isPrivateIpv4Address(apiUrl.hostname);
  if (apiUrl.protocol !== 'https:' && !(process.env.NODE_ENV === 'development' && localDevelopmentHost)) {
    throw new ApiError(message);
  }
}

function isPrivateIpv4Address(hostname: string) {
  const octets = hostname.split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }

  const first = octets[0];
  const second = octets[1];
  return first === 10 || (first === 192 && second === 168) || (first === 172 && second !== undefined && second >= 16 && second <= 31);
}

export async function getListings(filters: { q?: string; category?: string; produceTypeId?: string; province?: string; agriseta?: 'true'; cursor?: string } = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) query.set(key, value);
  }
  const suffix = query.size ? `?${query.toString()}` : '';
  return apiRequest<{ items: ListingSummary[]; page: { nextCursor: string | null } }>(`/listings${suffix}`);
}

export async function getListing(id: string) {
  return apiRequest<{ listing: ListingDetail; business: PublicBusiness; reviews?: PublicReview[] }>(`/listings/${encodeURIComponent(id)}`);
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
    // The sign-up form only allows submitting once the Privacy notice and Terms box is ticked.
    body: JSON.stringify({ email, password, role, acceptPrivacy: true }),
  });
  await saveNativeCredentials(result);
  return result.user;
}

export async function requestPasswordReset(email: string): Promise<string> {
  const result = await apiRequest<{ message: string }>('/auth/password-reset/request', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
  return result.message;
}

export async function confirmPasswordReset(token: string, password: string): Promise<string> {
  const result = await apiRequest<{ message: string }>('/auth/password-reset/confirm', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
  return result.message;
}

async function saveNativeCredentials(result: { accessToken?: string; refreshToken?: string }) {
  if (Platform.OS !== 'web') {
    if (!result.accessToken || !result.refreshToken) throw new ApiError('The sign-in response was incomplete.');
    accessToken = result.accessToken;
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, result.refreshToken);
  }
}

export async function signOut(): Promise<void> {
  if (Platform.OS === 'web') {
    // Web credentials are HttpOnly cookies that only the server can clear.
    await apiRequest('/auth/logout', { method: 'POST' });
    return;
  }
  // On a phone the credentials live on the device, so always remove them, even when the
  // server cannot be reached; revoking the server session is best effort.
  try {
    await apiRequest('/auth/logout', { method: 'POST' });
  } catch {
    // Offline or session already gone: the local credentials are still removed below.
  } finally {
    accessToken = null;
    await clearNativeRefreshToken();
  }
}
export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

export async function getNotifications(): Promise<{ items: AppNotification[]; unreadCount: number }> {
  return apiRequest('/notifications?limit=50');
}

export async function getUnreadNotificationCount(): Promise<number> {
  const result = await apiRequest<{ unreadCount: number }>('/notifications/unread-count');
  return result.unreadCount;
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiRequest(`/notifications/${id}/read`, { method: 'POST' });
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiRequest('/notifications/read-all', { method: 'POST' });
}

// Who the buyer buys for. Sellers see this on enquiries; it is needed before the first enquiry.
export const BUYER_ORGANISATION_TYPES = [
  { value: 'retailer', label: 'Retailer' },
  { value: 'hotel', label: 'Hotel or lodge' },
  { value: 'restaurant', label: 'Restaurant or caterer' },
  { value: 'processor', label: 'Food processor' },
  { value: 'exporter', label: 'Exporter' },
  { value: 'municipality', label: 'Municipality' },
  { value: 'government_programme', label: 'Government programme' },
  { value: 'school', label: 'School' },
  { value: 'commercial_farm', label: 'Commercial farm' },
  { value: 'informal_trader', label: 'Spaza or informal trader' },
  { value: 'other', label: 'Other' },
] as const;
export type BuyerOrganisationType = (typeof BUYER_ORGANISATION_TYPES)[number]['value'];
export type BuyerProfile = { organisationName: string; organisationType: BuyerOrganisationType };

export function buyerOrganisationLabel(type: string | null | undefined) {
  return BUYER_ORGANISATION_TYPES.find((option) => option.value === type)?.label ?? '';
}

export async function getBuyerProfile(): Promise<BuyerProfile | null> {
  const result = await apiRequest<{ profile: BuyerProfile | null }>('/buyer/profile');
  return result.profile;
}

export async function saveBuyerProfile(profile: BuyerProfile): Promise<BuyerProfile> {
  const result = await apiRequest<{ profile: BuyerProfile }>('/buyer/profile', { method: 'PUT', body: JSON.stringify(profile) });
  return result.profile;
}

// Reasons a listing can be reported for; the admin website reviews every report.
export const REPORT_REASONS = [
  { value: 'scam_or_fraud', label: 'Scam or fraud' },
  { value: 'fake_business', label: 'Fake business' },
  { value: 'wrong_information', label: 'Wrong information' },
  { value: 'offensive', label: 'Offensive content' },
  { value: 'other', label: 'Something else' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['value'];

export async function reportListing(listingId: string, reason: ReportReason, details: string): Promise<void> {
  await apiRequest('/reports', {
    method: 'POST',
    body: JSON.stringify({ targetType: 'listing', targetId: listingId, reason, details }),
  });
}

export async function acceptPrivacyNotice(): Promise<void> {
  await apiRequest('/auth/privacy/accept', { method: 'POST', body: '{}' });
}

export type DeletionRequest = {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reason: string;
  decisionNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

export async function getDeletionRequest(): Promise<DeletionRequest | null> {
  const result = await apiRequest<{ request: DeletionRequest | null }>('/account/deletion-request');
  return result.request;
}

export async function requestAccountDeletion(reason: string): Promise<DeletionRequest> {
  const result = await apiRequest<{ request: DeletionRequest }>('/account/deletion-request', {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
  return result.request;
}

export async function cancelAccountDeletion(): Promise<void> {
  await apiRequest('/account/deletion-request', { method: 'DELETE' });
}

// What came of an enquiry. The seller records it when closing; values are rough ranges only.
export type EnquiryOutcome = 'deal_made' | 'no_deal';
export const DEAL_VALUE_BANDS = [
  { value: 'under_5k', label: 'Under R5 000' },
  { value: '5k_50k', label: 'R5 000 – R50 000' },
  { value: '50k_250k', label: 'R50 000 – R250 000' },
  { value: 'over_250k', label: 'Over R250 000' },
  { value: 'prefer_not_to_say', label: 'Rather not say' },
] as const;
export type DealValueBand = (typeof DEAL_VALUE_BANDS)[number]['value'];

export function outcomeSummary(outcome: EnquiryOutcome | null | undefined, band: DealValueBand | null | undefined): string {
  if (outcome === 'no_deal') return 'No deal';
  if (outcome !== 'deal_made') return '';
  const range = DEAL_VALUE_BANDS.find((item) => item.value === band);
  return range && range.value !== 'prefer_not_to_say' ? `Deal made · ${range.label}` : 'Deal made';
}

// A buyer's rating of a supplier, attached to one of their enquiries.
export type EnquiryRating = { stars: number; comment: string; commentStatus: 'none' | 'pending' | 'approved' | 'hidden'; createdAt: string };

export async function rateSupplier(enquiryId: string, stars: number, comment: string, update: boolean): Promise<EnquiryRating> {
  const result = await apiRequest<{ rating: EnquiryRating }>(`/enquiries/${encodeURIComponent(enquiryId)}/rating`, {
    method: update ? 'PUT' : 'POST',
    body: JSON.stringify({ stars, comment }),
  });
  return result.rating;
}

export type SellerRatings = {
  ratingCount: number;
  ratingAverage: number | null;
  publicFrom: number;
  isPublic: boolean;
  pendingComments: number;
  reviews: PublicReview[];
};

export async function getSellerRatings(): Promise<SellerRatings> {
  return apiRequest<SellerRatings>('/seller/enquiries/ratings');
}

export async function reportRating(ratingId: string, details: string): Promise<void> {
  await apiRequest('/reports', {
    method: 'POST',
    body: JSON.stringify({ targetType: 'rating', targetId: ratingId, reason: 'other', details }),
  });
}

// Switch a buyer account to also sell. Sellers keep every buyer ability.
export async function becomeSeller(): Promise<SessionUser> {
  const result = await apiRequest<{ user: SessionUser }>('/auth/become-seller', { method: 'POST', body: '{}' });
  return result.user;
}
