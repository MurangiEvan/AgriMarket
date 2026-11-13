// Talks to the AgriMarket API through this site's own /api/v1 path (see next.config.ts rewrites).
// Same-origin requests mean the httpOnly session cookies are first-party and sent automatically.

export type AdminUser = { id: string; email: string; role: 'buyer' | 'seller' | 'admin' };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

let refreshInFlight: Promise<boolean> | null = null;

// Access tokens are short-lived; the refresh cookie silently issues a new one.
function refreshSession(): Promise<boolean> {
  refreshInFlight ??= fetch('/api/v1/auth/refresh', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

export async function api<T>(path: string, init: RequestInit = {}, allowRefresh = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');

  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, { ...init, headers, credentials: 'same-origin', cache: 'no-store' });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach AgriMarket. Check your internet connection and try again.');
  }

  if (response.status === 401 && allowRefresh && !path.startsWith('/auth/') && (await refreshSession())) {
    return api<T>(path, init, false);
  }
  if (response.status === 204) return undefined as T;

  const body = (await response.json().catch(() => null)) as { data?: T; error?: { code?: string; message?: string } } | null;
  if (!response.ok) {
    if (response.status >= 500 && !body?.error) {
      throw new ApiError(response.status, 'SERVER_UNAVAILABLE', 'The AgriMarket server is starting up or unavailable. Wait a moment and try again.');
    }
    throw new ApiError(response.status, body?.error?.code ?? 'REQUEST_FAILED', body?.error?.message ?? `Request failed (${response.status}).`);
  }
  return body?.data as T;
}

export function errorMessage(cause: unknown, fallback: string) {
  return cause instanceof ApiError ? cause.message : fallback;
}

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
}

// Plain-language names for audit actions recorded by the API.
export const auditActionLabels: Record<string, string> = {
  'application.submitted': 'Seller application submitted',
  'verification.approved': 'Business approved',
  'verification.rejected': 'Business rejected',
  'verification.document.read': 'Verification document opened',
  'listing.published': 'Photo approved and published',
  'listing.rejected': 'Photo rejected',
  'listing.archived': 'Listing archived',
  'user.password_reset': 'Password reset',
  'user.admin_bootstrap': 'Administrator account created',
  'export.businesses': 'Verified businesses exported (CSV)',
  'export.enquiries': 'Enquiry activity exported (CSV)',
};

export function auditLabel(action: string) {
  return auditActionLabels[action] ?? action;
}
