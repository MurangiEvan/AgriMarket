'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useAdmin } from '@/components/admin-shell';
import { api, auditLabel, errorMessage, formatDateTime } from '@/lib/api';

type AuditItem = { id: string; action: string; targetType: string; createdAt: string };

const dealValueOptions = [
  { value: 'under_5k', label: 'Under R5 000' },
  { value: '5k_50k', label: 'R5 000 to R50 000' },
  { value: '50k_250k', label: 'R50 000 to R250 000' },
  { value: 'over_250k', label: 'Over R250 000' },
  { value: 'prefer_not_to_say', label: 'Not shared' },
  { value: 'not_given', label: 'No value given' },
];

const buyerTypeOptions = [
  { value: 'retailer', label: 'Retailers' },
  { value: 'hotel', label: 'Hotels' },
  { value: 'restaurant', label: 'Restaurants' },
  { value: 'processor', label: 'Processors' },
  { value: 'exporter', label: 'Exporters' },
  { value: 'municipality', label: 'Municipalities' },
  { value: 'government_programme', label: 'Government programmes' },
  { value: 'school', label: 'Schools' },
  { value: 'commercial_farm', label: 'Commercial farms' },
  { value: 'informal_trader', label: 'Informal traders' },
  { value: 'other', label: 'Other' },
  { value: 'not_set', label: 'Not set yet' },
];

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
  const openReports = overview?.openReports ?? 0;
  const pendingDeletions = overview?.pendingDeletionRequests ?? 0;
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
        <Link href="/reports" className={`stat ${openReports ? 'attention' : ''}`}>
          <span>Reports to review</span>
          <strong>{value(overview?.openReports)}</strong>
          <span>Check reported listings →</span>
        </Link>
        <Link href="/deletions" className={`stat ${pendingDeletions ? 'attention' : ''}`}>
          <span>Deletion requests</span>
          <strong>{value(overview?.pendingDeletionRequests)}</strong>
          <span>Review account deletions →</span>
        </Link>
      </section>

      <section aria-labelledby="totals-title" className="stack">
        <h2 id="totals-title">Marketplace totals</h2>
        <div className="stats">
          <div className="stat"><span>Approved businesses</span><strong>{value(overview?.businesses.approved)}</strong></div>
          <div className="stat"><span>Published listings</span><strong>{value(overview?.listings.published)}</strong></div>
          <div className="stat"><span>Sellers</span><strong>{value(overview?.users.seller)}</strong></div>
          <div className="stat"><span>Buyers</span><strong>{value(overview?.users.buyer)}</strong></div>
          <div className="stat"><span>AgriSETA-supported businesses</span><strong>{value(overview?.agrisetaSupportedBusinesses)}</strong></div>
          <div className="stat"><span>Rejected applications</span><strong>{value(overview?.verifications.rejected)}</strong></div>
        </div>
      </section>

      <section aria-labelledby="deals-title" className="card stack">
        <div>
          <h2 id="deals-title">What enquiries led to</h2>
          <p className="muted">Sellers record the outcome when they close an enquiry. Deal values are rough ranges, never exact amounts.</p>
        </div>
        <div className="stats">
          <div className="stat">
            <span>Buyer satisfaction</span>
            <strong>{overview ? (overview.ratings.satisfactionScore === null ? '–' : `${overview.ratings.satisfactionScore}%`) : '–'}</strong>
            <span className="muted">4–5 stars, from {overview?.ratings.total ?? 0} ratings (target above 85%)</span>
          </div>
          <div className="stat"><span>Deals made</span><strong>{value(overview?.deals.made)}</strong></div>
          <div className="stat"><span>Outcomes recorded</span><strong>{value(overview?.deals.outcomesRecorded)}</strong></div>
          <div className="stat">
            <span>Deal rate</span>
            <strong>{overview ? (overview.deals.dealRate === null ? '–' : `${overview.deals.dealRate}%`) : '–'}</strong>
            <span className="muted">of closed enquiries</span>
          </div>
        </div>
        {overview && overview.deals.made > 0 ? (
          <div className="row">
            {dealValueOptions.map((band) => (
              <span key={band.value} className="pill" style={{ fontSize: 13, padding: '6px 12px' }}>
                {band.label}: {overview.deals.valueBands[band.value] ?? 0}
              </span>
            ))}
          </div>
        ) : null}
      </section>

      <section aria-labelledby="buyers-title" className="card stack">
        <div>
          <h2 id="buyers-title">Who is buying</h2>
          <p className="muted">Buyer organisations by type. Buyers choose a type before sending their first enquiry.</p>
        </div>
        {overview ? (
          <div className="row">
            {buyerTypeOptions
              .map((type) => ({ ...type, count: overview.buyerTypes[type.value] ?? 0 }))
              .filter((type) => type.count > 0 || type.value !== 'not_set')
              .map((type) => (
                <span key={type.value} className="pill" style={{ fontSize: 13, padding: '6px 12px' }}>
                  {type.label}: {type.count}
                </span>
              ))}
          </div>
        ) : <p className="muted">Loading…</p>}
      </section>

      <section aria-labelledby="exports-title" className="card stack">
        <div>
          <h2 id="exports-title">Exports for partners</h2>
          <p className="muted">Download CSV files for a CRM, AgriSMME or procurement and enterprise-development partners. Each download is recorded in the audit log.</p>
        </div>
        <div className="row">
          <a className="button secondary" href="/api/v1/admin/exports/businesses.csv" download>Verified businesses (CSV)</a>
          <a className="button secondary" href="/api/v1/admin/exports/enquiries.csv" download>Enquiry activity (CSV)</a>
        </div>
        <p className="muted">The business file includes contact details: share it only with approved partners. The enquiry file leaves out message text and buyer emails.</p>
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
