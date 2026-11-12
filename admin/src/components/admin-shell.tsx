'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { api, ApiError, errorMessage, type AdminUser } from '@/lib/api';

type Overview = {
  verifications: Partial<Record<'pending' | 'approved' | 'rejected', number>>;
  businesses: Partial<Record<'not_submitted' | 'pending' | 'approved' | 'rejected', number>>;
  listings: Partial<Record<'draft' | 'pending' | 'published' | 'rejected' | 'archived', number>>;
  users: Partial<Record<'buyer' | 'seller' | 'admin', number>>;
};

type AdminContextValue = {
  user: AdminUser;
  overview: Overview | null;
  // Pages call this after a decision so the sidebar counts stay current.
  refreshOverview: () => Promise<void>;
};

export type { Overview };

const AdminContext = createContext<AdminContextValue | null>(null);

export function useAdmin() {
  const context = useContext(AdminContext);
  if (!context) throw new Error('useAdmin must be used inside AdminShell.');
  return context;
}

const navigation = [
  { href: '/', label: 'Overview', badge: null },
  { href: '/verifications', label: 'Verifications', badge: 'verifications' },
  { href: '/photos', label: 'Produce photos', badge: 'photos' },
  { href: '/audit', label: 'Audit log', badge: null },
] as const;

type SessionState = { status: 'loading' } | { status: 'ready'; user: AdminUser } | { status: 'error'; message: string };

export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<SessionState>({ status: 'loading' });
  const [overview, setOverview] = useState<Overview | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [signingOut, setSigningOut] = useState(false);

  const refreshOverview = useCallback(async () => {
    try {
      setOverview(await api<Overview>('/admin/overview'));
    } catch {
      // Counts are a convenience; pages show their own errors.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    api<{ user: AdminUser }>('/auth/me')
      .then(async ({ user }) => {
        if (cancelled) return;
        if (user.role !== 'admin') {
          await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
          router.replace('/login');
          return;
        }
        setSession({ status: 'ready', user });
        void refreshOverview();
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        if (cause instanceof ApiError && cause.status === 401) {
          router.replace('/login');
          return;
        }
        setSession({ status: 'error', message: errorMessage(cause, 'Could not check your session.') });
      });
    return () => {
      cancelled = true;
    };
  }, [router, refreshOverview, attempt]);

  async function signOut() {
    setSigningOut(true);
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.replace('/login');
  }

  if (session.status === 'loading') {
    return (
      <div className="loading" role="status">
        <div className="spinner" aria-hidden="true" />
        <p>Checking your administrator session…</p>
        <p className="muted">If the server was asleep this can take up to a minute.</p>
      </div>
    );
  }

  if (session.status === 'error') {
    return (
      <div className="loading" role="alert">
        <h2>AgriMarket is not responding</h2>
        <p className="muted">{session.message}</p>
        <button className="button primary" type="button" onClick={() => { setSession({ status: 'loading' }); setAttempt((value) => value + 1); }}>Try again</button>
      </div>
    );
  }

  const badgeCounts = { verifications: overview?.verifications.pending ?? 0, photos: overview?.listings.pending ?? 0 };

  return (
    <AdminContext.Provider value={{ user: session.user, overview, refreshOverview }}>
      <div className="shell">
        <nav className="sidebar" aria-label="Admin navigation">
          <div className="brand"><span className="brand-mark" aria-hidden="true">A</span>AgriMarket Admin</div>
          {navigation.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            const count = item.badge ? badgeCounts[item.badge] : 0;
            return (
              <Link key={item.href} href={item.href} className="nav-link" aria-current={active ? 'page' : undefined}>
                {item.label}
                {count > 0 ? <span className="nav-badge" aria-label={`${count} waiting`}>{count}</span> : null}
              </Link>
            );
          })}
          <div className="sidebar-footer">
            <span>{session.user.email}</span>
            <button className="button ghost small" type="button" onClick={signOut} disabled={signingOut}>{signingOut ? 'Signing out…' : 'Sign out'}</button>
          </div>
        </nav>
        <main className="main">{children}</main>
      </div>
    </AdminContext.Provider>
  );
}
