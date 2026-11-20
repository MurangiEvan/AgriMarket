'use client';

import { useCallback, useEffect, useState } from 'react';

import { useAdmin } from '@/components/admin-shell';
import { api, errorMessage, formatDateTime } from '@/lib/api';

type ReportStatus = 'open' | 'dismissed' | 'actioned';

type Report = {
  id: string;
  targetType: 'listing' | 'rating';
  targetId: string;
  reason: string;
  details: string;
  status: ReportStatus;
  createdAt: string;
  reviewedAt: string | null;
  resolutionNote: string | null;
  reporterEmail: string;
  reporterRole: string;
  openReportsOnTarget: number;
  listing: {
    title: string;
    description: string;
    status: string;
    businessName: string;
    town: string | null;
    province: string;
  } | null;
  rating: {
    stars: number;
    comment: string;
    hidden: boolean;
    businessName: string;
    createdAt: string;
  } | null;
};

const reasonLabels: Record<string, string> = {
  scam_or_fraud: 'Scam or fraud',
  fake_business: 'Fake business',
  wrong_information: 'Wrong information',
  offensive: 'Offensive content',
  other: 'Something else',
};

const tabs: { value: ReportStatus; label: string }[] = [
  { value: 'open', label: 'To review' },
  { value: 'actioned', label: 'Taken down' },
  { value: 'dismissed', label: 'Dismissed' },
];

export default function ReportsPage() {
  const { refreshOverview } = useAdmin();
  const [status, setStatus] = useState<ReportStatus>('open');
  const [items, setItems] = useState<Report[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async (next: ReportStatus) => {
    setItems(await api<Report[]>(`/admin/reports?status=${next}`));
  }, []);

  useEffect(() => {
    let current = true;
    api<Report[]>(`/admin/reports?status=${status}`)
      .then((rows) => { if (current) setItems(rows); })
      .catch((cause: unknown) => { if (current) setError(errorMessage(cause, 'Reports could not be loaded.')); });
    return () => { current = false; };
  }, [status]);

  function switchTab(next: ReportStatus) {
    setItems(null);
    setError('');
    setNotice('');
    setStatus(next);
  }

  async function decide(item: Report, action: 'dismiss' | 'take_down') {
    const isRating = item.targetType === 'rating';
    const title = isRating ? 'the rating' : item.listing?.title ?? 'this listing';
    const business = (isRating ? item.rating?.businessName : item.listing?.businessName) ?? 'the seller';
    const question = isRating
      ? `Hide this rating of ${business}? Its stars stop counting and its comment disappears.`
      : `Take down ${title} from ${business}? Buyers will no longer see it and the seller will be told.`;
    if (action === 'take_down' && !window.confirm(question)) return;
    setBusyId(item.id);
    setError('');
    setNotice('');
    try {
      await api(`/admin/reports/${item.id}/decision`, { method: 'POST', body: JSON.stringify({ action, note: notes[item.id] ?? '' }) });
      setNotice(action === 'take_down' ? `${title} from ${business} was taken down.` : `The report about ${title} was dismissed.`);
      await Promise.all([load(status), refreshOverview()]);
    } catch (cause) {
      setError(errorMessage(cause, 'The decision could not be saved.'));
    } finally {
      setBusyId('');
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Reports</h1>
          <p>Listings reported as a scam, fake or wrong, and ratings a seller thinks are unfair. Nobody is told who reported them.</p>
        </div>
        <div className="tabs" role="tablist" aria-label="Report status">
          {tabs.map((tab) => (
            <button key={tab.value} className="tab" type="button" role="tab" aria-selected={status === tab.value} onClick={() => switchTab(tab.value)}>{tab.label}</button>
          ))}
        </div>
      </header>

      {error ? <p role="alert" className="alert error">{error}</p> : null}
      {notice ? <p role="status" className="alert success">{notice}</p> : null}
      {items === null && !error ? <p className="muted">Loading…</p> : null}
      {items?.length === 0 ? <div className="card empty">{status === 'open' ? 'No reports are waiting for review.' : 'Nothing here yet.'}</div> : null}

      <div className="stack">
        {items?.map((item) => (
          <article key={item.id} className="card stack" aria-labelledby={`report-${item.id}`}>
            <div className="row spread">
              <h3 id={`report-${item.id}`}>
                {item.targetType === 'rating'
                  ? item.rating ? `Rating of ${item.rating.businessName}` : 'Rating no longer exists'
                  : item.listing ? `${item.listing.title} · ${item.listing.businessName}` : 'Listing no longer exists'}
              </h3>
              <span className="pill">{reasonLabels[item.reason] ?? item.reason}</span>
            </div>
            {item.listing ? (
              <p className="muted">
                {[item.listing.town, item.listing.province].filter(Boolean).join(', ')} · listing is {item.listing.status}
                {item.openReportsOnTarget > 1 ? ` · ${item.openReportsOnTarget} open reports about this listing` : ''}
              </p>
            ) : null}
            {item.listing?.description ? <p style={{ fontSize: 14 }}>{item.listing.description}</p> : null}
            {item.rating ? (
              <p style={{ fontSize: 14 }}>
                <strong aria-label={`${item.rating.stars} out of 5 stars`}>{'★'.repeat(item.rating.stars)}{'☆'.repeat(5 - item.rating.stars)}</strong>
                {item.rating.comment ? ` “${item.rating.comment}”` : ' (no comment)'}
                {item.rating.hidden ? ' · already hidden' : ''}
              </p>
            ) : null}
            <div className="alert info">
              <strong>What the reporter said:</strong> {item.details || 'No details given.'}
            </div>
            <p className="muted">
              Reported {formatDateTime(item.createdAt)} by {item.reporterEmail} ({item.reporterRole})
              {item.reviewedAt ? ` · reviewed ${formatDateTime(item.reviewedAt)}` : ''}
            </p>
            {item.resolutionNote ? <p className="muted">Administrator note: {item.resolutionNote}</p> : null}

            {item.status === 'open' ? (
              <>
                <div className="field">
                  <label htmlFor={`note-${item.id}`}>{item.targetType === 'rating' ? 'Note (kept in the review history)' : 'Note (sent to the seller if you take the listing down)'}</label>
                  <textarea
                    id={`note-${item.id}`}
                    className="input"
                    rows={2}
                    maxLength={1000}
                    value={notes[item.id] ?? ''}
                    onChange={(event) => setNotes({ ...notes, [item.id]: event.target.value })}
                  />
                </div>
                <div className="row">
                  {item.listing || (item.rating && !item.rating.hidden) ? (
                    <button className="button danger small" type="button" disabled={busyId === item.id} onClick={() => decide(item, 'take_down')}>
                      {item.targetType === 'rating' ? 'Hide rating' : 'Take listing down'}
                    </button>
                  ) : null}
                  <button className="button secondary small" type="button" disabled={busyId === item.id} onClick={() => decide(item, 'dismiss')}>Dismiss report</button>
                </div>
              </>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
