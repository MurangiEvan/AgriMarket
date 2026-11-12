'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useAdmin } from '@/components/admin-shell';
import { api, auditLabel, errorMessage, formatDateTime } from '@/lib/api';

type AuditItem = { id: string; action: string; targetType: string; createdAt: string };

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

export default function OverviewPage() {
  const { overview, refreshOverview } = useAdmin();
  const [recent, setRecent] = useState<AuditItem[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<AuditItem[]>('/admin/audit-logs?limit=8')
      .then(setRecent)
      .catch((cause: unknown) => setError(errorMessage(cause, 'Recent activity could not be loaded.')));
  }, []);

  const pendingVerifications = overview?.verifications.pending ?? 0;
  const pendingPhotos = overview?.listings.pending ?? 0;
  const value = (count: number | undefined) => (overview ? count ?? 0 : '–');

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>{greeting()}</h1>
          <p>Here is what needs your attention on AgriMarket today.</p>
        </div>
        <button className="button secondary small" type="button" onClick={() => void refreshOverview()}>Refresh counts</button>
      </header>

      <section aria-label="Waiting for review" className="stats">
        <Link href="/verifications" className={`stat ${pendingVerifications ? 'attention' : ''}`}>
          <span>Applications waiting</span>
          <strong>{value(overview?.verifications.pending)}</strong>
          <span>Review seller applications →</span>
        </Link>
        <Link href="/photos" className={`stat ${pendingPhotos ? 'attention' : ''}`}>
          <span>Produce photos waiting</span>
          <strong>{value(overview?.listings.pending)}</strong>
          <span>Approve and publish →</span>
        </Link>
      </section>

      <section aria-labelledby="totals-title" className="stack">
        <h2 id="totals-title">Marketplace totals</h2>
        <div className="stats">
          <div className="stat"><span>Approved businesses</span><strong>{value(overview?.businesses.approved)}</strong></div>
          <div className="stat"><span>Published listings</span><strong>{value(overview?.listings.published)}</strong></div>
          <div className="stat"><span>Sellers</span><strong>{value(overview?.users.seller)}</strong></div>
          <div className="stat"><span>Buyers</span><strong>{value(overview?.users.buyer)}</strong></div>
          <div className="stat"><span>Rejected verifications</span><strong>{value(overview?.verifications.rejected)}</strong></div>
        </div>
      </section>

      <section aria-labelledby="recent-title" className="card stack">
        <div className="row spread">
          <h2 id="recent-title">Recent activity</h2>
          <Link href="/audit" className="button secondary small">Full audit log</Link>
        </div>
        {error ? <p role="alert" className="alert error">{error}</p> : null}
        {recent === null && !error ? <p className="muted">Loading…</p> : null}
        {recent?.length === 0 ? <p className="empty">No activity has been recorded yet.</p> : null}
        {recent?.map((item) => (
          <div key={item.id} className="row spread" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
            <strong>{auditLabel(item.action)}</strong>
            <span className="muted">{formatDateTime(item.createdAt)}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
