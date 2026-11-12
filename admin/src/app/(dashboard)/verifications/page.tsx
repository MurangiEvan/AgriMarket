'use client';

import { useCallback, useEffect, useState } from 'react';

import { useAdmin } from '@/components/admin-shell';
import { api, errorMessage, formatDateTime } from '@/lib/api';

type Status = 'pending' | 'approved' | 'rejected';
type Verification = {
  id: string;
  status: Status;
  submittedAt: string;
  reviewedAt: string | null;
  sellerFeedback: string | null;
  documentCount: number;
  businessName: string;
  province: string;
  ownerEmail: string;
};

const tabs: { value: Status; label: string }[] = [
  { value: 'pending', label: 'Waiting' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

export default function VerificationsPage() {
  const { refreshOverview } = useAdmin();
  const [status, setStatus] = useState<Status>('pending');
  const [items, setItems] = useState<Verification[] | null>(null);
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async (which: Status) => {
    setItems(await api<Verification[]>(`/admin/verifications?status=${which}&limit=50`));
  }, []);

  useEffect(() => {
    // Ignore a slow response for a tab the admin has already left.
    let current = true;
    api<Verification[]>(`/admin/verifications?status=${status}&limit=50`)
      .then((rows) => { if (current) setItems(rows); })
      .catch((cause: unknown) => { if (current) setError(errorMessage(cause, 'The verification queue could not be loaded.')); });
    return () => { current = false; };
  }, [status]);

  function changeTab(next: Status) {
    setStatus(next);
    setItems(null);
    setError('');
    setNotice('');
  }

  async function decide(item: Verification, decision: 'approved' | 'rejected') {
    const sellerFeedback = feedback[item.id]?.trim() ?? '';
    if (decision === 'rejected' && !sellerFeedback) {
      setError(`Write feedback for ${item.businessName} before rejecting, so the seller knows what to fix.`);
      return;
    }
    if (decision === 'rejected' && !window.confirm(`Reject ${item.businessName}? The seller will see your feedback.`)) return;
    setBusyId(item.id);
    setError('');
    setNotice('');
    try {
      await api(`/admin/verifications/${item.id}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision, sellerFeedback: sellerFeedback || null, internalReason: null }),
      });
      setNotice(decision === 'approved' ? `${item.businessName} is approved. Their photos can now be published.` : `${item.businessName} was rejected and the seller can see your feedback.`);
      await Promise.all([load(status), refreshOverview()]);
    } catch (cause) {
      setError(errorMessage(cause, 'The decision could not be recorded.'));
    } finally {
      setBusyId('');
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Seller verifications</h1>
          <p>Open each document, then approve the business or reject it with feedback. Every action is recorded in the audit log.</p>
        </div>
      </header>

      <div className="tabs" role="tablist" aria-label="Verification status">
        {tabs.map((tab) => (
          <button key={tab.value} role="tab" type="button" className="tab" aria-selected={status === tab.value} onClick={() => changeTab(tab.value)}>{tab.label}</button>
        ))}
      </div>

      {error ? <p role="alert" className="alert error">{error}</p> : null}
      {notice ? <p role="status" className="alert success">{notice}</p> : null}
      {items === null && !error ? <p className="muted">Loading…</p> : null}
      {items?.length === 0 ? <div className="card empty">{status === 'pending' ? 'No businesses are waiting for verification.' : `No ${status} verifications yet.`}</div> : null}

      {items?.map((item) => (
        <article key={item.id} className="card stack" aria-labelledby={`business-${item.id}`}>
          <div className="row spread">
            <div>
              <h3 id={`business-${item.id}`}>{item.businessName}</h3>
              <p className="muted">{item.ownerEmail} · {item.province}</p>
            </div>
            <span className={`pill ${item.status}`}>{item.status === 'pending' ? 'Waiting' : item.status === 'approved' ? 'Approved' : 'Rejected'}</span>
          </div>
          <p className="muted">
            Submitted {formatDateTime(item.submittedAt)}
            {item.reviewedAt ? ` · Reviewed ${formatDateTime(item.reviewedAt)}` : ''}
          </p>

          <div className="stack" style={{ gap: 6 }}>
            <span className="label">Documents ({item.documentCount})</span>
            <div className="row">
              {Array.from({ length: item.documentCount }, (_, index) => (
                <a key={index} className="button secondary small" href={`/api/v1/admin/verifications/${item.id}/documents/${index}`} download>
                  Download document {index + 1}
                </a>
              ))}
            </div>
            <p className="muted">Documents are private. Opening one is recorded in the audit log.</p>
          </div>

          {item.status === 'pending' ? (
            <>
              <div className="field">
                <label htmlFor={`feedback-${item.id}`}>Feedback for the seller (required when rejecting)</label>
                <textarea
                  id={`feedback-${item.id}`}
                  className="input"
                  placeholder="e.g. Please upload a clearer copy of your CIPC registration certificate."
                  value={feedback[item.id] ?? ''}
                  onChange={(event) => setFeedback((current) => ({ ...current, [item.id]: event.target.value }))}
                />
              </div>
              <div className="row">
                <button className="button primary" type="button" disabled={busyId === item.id} onClick={() => decide(item, 'approved')}>Approve business</button>
                <button className="button danger" type="button" disabled={busyId === item.id} onClick={() => decide(item, 'rejected')}>Reject</button>
              </div>
            </>
          ) : item.sellerFeedback ? (
            <p><span className="label">Feedback sent: </span>{item.sellerFeedback}</p>
          ) : null}
        </article>
      ))}
    </div>
  );
}
