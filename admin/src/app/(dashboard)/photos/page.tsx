'use client';

import { useCallback, useEffect, useState } from 'react';

import { useAdmin } from '@/components/admin-shell';
import { api, errorMessage, formatDateTime } from '@/lib/api';

type Listing = {
  id: string;
  title: string;
  description?: string;
  town?: string | null;
  createdAt: string;
  businessName: string;
  verificationStatus: string;
  imageUrl: string | null;
};

export default function PhotosPage() {
  const { refreshOverview } = useAdmin();
  const [items, setItems] = useState<Listing[] | null>(null);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setItems(await api<Listing[]>('/admin/listings?limit=50'));
  }, []);

  useEffect(() => {
    api<Listing[]>('/admin/listings?limit=50')
      .then(setItems)
      .catch((cause: unknown) => setError(errorMessage(cause, 'Produce photos could not be loaded.')));
  }, []);

  async function moderate(item: Listing, status: 'published' | 'rejected') {
    if (status === 'rejected' && !window.confirm(`Reject the ${item.title} photo from ${item.businessName}?`)) return;
    setBusyId(item.id);
    setError('');
    setNotice('');
    try {
      await api(`/admin/listings/${item.id}/moderation`, { method: 'PATCH', body: JSON.stringify({ status, reason: '' }) });
      setNotice(status === 'published' ? `${item.title} from ${item.businessName} is now visible to buyers.` : `${item.title} from ${item.businessName} was rejected.`);
      await Promise.all([load(), refreshOverview()]);
    } catch (cause) {
      setError(errorMessage(cause, 'The photo could not be moderated.'));
    } finally {
      setBusyId('');
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Produce photos</h1>
          <p>Check each photo before buyers can see it. Only photos from approved businesses can be published.</p>
        </div>
      </header>

      {error ? <p role="alert" className="alert error">{error}</p> : null}
      {notice ? <p role="status" className="alert success">{notice}</p> : null}
      {items === null && !error ? <p className="muted">Loading…</p> : null}
      {items?.length === 0 ? <div className="card empty">No produce photos are waiting for approval.</div> : null}

      <div className="photo-grid">
        {items?.map((item) => {
          const approvedBusiness = item.verificationStatus === 'approved';
          return (
            <article key={item.id} className="card photo-card" aria-labelledby={`listing-${item.id}`}>
              {item.imageUrl ? (
                <img className="photo" src={item.imageUrl} alt={`${item.title} from ${item.businessName}`} loading="lazy" />
              ) : (
                <div className="photo photo-missing">No photo uploaded</div>
              )}
              <div className="photo-body">
                <div>
                  <h3 id={`listing-${item.id}`}>{item.title}</h3>
                  <p className="muted">{item.businessName}{item.town ? ` · ${item.town}` : ''}</p>
                </div>
                {item.description ? <p style={{ fontSize: 14 }}>{item.description}</p> : null}
                <p className="muted">Sent {formatDateTime(item.createdAt)}</p>
                {!approvedBusiness ? <p className="alert info">Approve this business under Verifications before publishing its photos.</p> : null}
                <div className="row">
                  {approvedBusiness ? (
                    <button className="button primary small" type="button" disabled={busyId === item.id} onClick={() => moderate(item, 'published')}>Approve &amp; publish</button>
                  ) : null}
                  <button className="button danger small" type="button" disabled={busyId === item.id} onClick={() => moderate(item, 'rejected')}>Reject</button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
