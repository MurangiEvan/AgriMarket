'use client';

import { useCallback, useEffect, useState } from 'react';

import { useAdmin } from '@/components/admin-shell';
import { api, errorMessage, formatDateTime } from '@/lib/api';

type CommentStatus = 'pending' | 'approved' | 'hidden';

type RatingComment = {
  id: string;
  stars: number;
  comment: string;
  commentStatus: CommentStatus;
  hidden: boolean;
  createdAt: string;
  updatedAt: string;
  businessName: string;
  buyerEmail: string;
  buyerType: string | null;
};

const tabs: { value: CommentStatus; label: string }[] = [
  { value: 'pending', label: 'To review' },
  { value: 'approved', label: 'Shown' },
  { value: 'hidden', label: 'Hidden' },
];

function Stars({ count }: { count: number }) {
  return <strong aria-label={`${count} out of 5 stars`} style={{ color: '#b7791f', letterSpacing: 2 }}>{'★'.repeat(count)}{'☆'.repeat(5 - count)}</strong>;
}

export default function RatingsPage() {
  const { refreshOverview } = useAdmin();
  const [status, setStatus] = useState<CommentStatus>('pending');
  const [items, setItems] = useState<RatingComment[] | null>(null);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async (next: CommentStatus) => {
    setItems(await api<RatingComment[]>(`/admin/ratings?commentStatus=${next}`));
  }, []);

  useEffect(() => {
    let current = true;
    api<RatingComment[]>(`/admin/ratings?commentStatus=${status}`)
      .then((rows) => { if (current) setItems(rows); })
      .catch((cause: unknown) => { if (current) setError(errorMessage(cause, 'Rating comments could not be loaded.')); });
    return () => { current = false; };
  }, [status]);

  function switchTab(next: CommentStatus) {
    setItems(null);
    setError('');
    setNotice('');
    setStatus(next);
  }

  async function decide(item: RatingComment, action: 'approve' | 'hide') {
    setBusyId(item.id);
    setError('');
    setNotice('');
    try {
      await api(`/admin/ratings/${item.id}/comment`, { method: 'POST', body: JSON.stringify({ action }) });
      setNotice(action === 'approve' ? `The comment about ${item.businessName} is now public.` : `The comment about ${item.businessName} is hidden. Its stars still count.`);
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
          <h1>Rating comments</h1>
          <p>Buyers&apos; written comments appear on listing pages only after you approve them. Star ratings count straight away. To remove a whole rating, use Reports.</p>
        </div>
        <div className="tabs" role="tablist" aria-label="Comment status">
          {tabs.map((tab) => (
            <button key={tab.value} className="tab" type="button" role="tab" aria-selected={status === tab.value} onClick={() => switchTab(tab.value)}>{tab.label}</button>
          ))}
        </div>
      </header>

      {error ? <p role="alert" className="alert error">{error}</p> : null}
      {notice ? <p role="status" className="alert success">{notice}</p> : null}
      {items === null && !error ? <p className="muted">Loading…</p> : null}
      {items?.length === 0 ? <div className="card empty">{status === 'pending' ? 'No comments are waiting for review.' : 'Nothing here yet.'}</div> : null}

      <div className="stack">
        {items?.map((item) => (
          <article key={item.id} className="card stack" aria-labelledby={`rating-${item.id}`}>
            <div className="row spread">
              <h3 id={`rating-${item.id}`}>{item.businessName}</h3>
              <Stars count={item.stars} />
            </div>
            <p style={{ fontSize: 15 }}>&ldquo;{item.comment}&rdquo;</p>
            <p className="muted">
              From {item.buyerEmail}{item.buyerType ? ` (${item.buyerType.replace(/_/g, ' ')})` : ''} · {formatDateTime(item.updatedAt)}
              {item.hidden ? ' · whole rating hidden after a report' : ''}
            </p>
            <div className="row">
              {item.commentStatus !== 'approved' && !item.hidden ? (
                <button className="button primary small" type="button" disabled={busyId === item.id} onClick={() => decide(item, 'approve')}>Approve comment</button>
              ) : null}
              {item.commentStatus !== 'hidden' ? (
                <button className="button secondary small" type="button" disabled={busyId === item.id} onClick={() => decide(item, 'hide')}>Hide comment</button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
