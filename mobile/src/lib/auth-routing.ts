import type { Href } from 'expo-router';

export type AuthRole = 'buyer' | 'seller' | 'admin';
export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

const publicRoutes = new Set(['sign-in', 'sign-up', 'forgot-password']);
// Opened from an emailed link, so it must work whether or not this device is signed in.
const anyStatusRoutes = new Set(['reset-password']);

export function getAuthRedirect(status: AuthStatus, role: AuthRole | null, route: string): Href | null {
  if (status === 'loading') return null;
  if (anyStatusRoutes.has(route)) return null;
  if (status === 'signedOut') return publicRoutes.has(route) ? null : '/sign-in';
  if (!role) return '/sign-in';

  const home: Href = role === 'buyer' ? '/market' : role === 'seller' ? '/account' : '/admin';
  if (publicRoutes.has(route) || !route || (route === 'market' && role !== 'buyer') || (route === 'admin' && role !== 'admin')) {
    return home;
  }
  return null;
}
