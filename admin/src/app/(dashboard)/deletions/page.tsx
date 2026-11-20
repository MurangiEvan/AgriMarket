'use client';

import { useCallback, useEffect, useState } from 'react';

import { useAdmin } from '@/components/admin-shell';
import { api, errorMessage, formatDateTime } from '@/lib/api';

type DeletionStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

type DeletionRequest = {
  id: string;
  userId: string;
  reason: string;
  status: DeletionStatus;
  decisionNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  email: string;
  role: string;
  memberSince: string;
  business: { name: string; verificationStatus: string } | null;
  openReportsAgainstUser: number;
};

const tabs: { value: DeletionStatus; label: string }[] = [
  { value: 'pending', label: 'To review' },
  { value: 'approved', label: 'Deleted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled by user' },
];

export default function DeletionsPage() {
  const { refreshOverview } = useAdmin();
  const [status, setStatus] = useState<DeletionStatus>('pending');
  const [items, setItems] = useState<DeletionRequest[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async (next: DeletionStatus) => {
    setItems(await api<DeletionRequest[]>(`/admin/deletion-requests?status=${next}`));
  }, []);

  useEffect(() => {
    let current = true;
    api<DeletionRequest[]>(`/admin/deletion-requests?status=${status}`)
      .then((rows) => { if (current) setItems(rows); })
      .catch((cause: unknown) => { if (current) setError(errorMessage(cause, 'Deletion requests could not be loaded.')); });
    return () => { current = false; };
  }, [status]);

  function switchTab(next: DeletionStatus) {
    setItems(null);
    setError('');
    setNotice('');
    setStatus(next);
  }

  async function decide(item: DeletionRequest, decision: 'approved' | 'rejected') {
    const note = (notes[item.id] ?? '').trim();
    if (decision === 'rejected' && !note) {
      setError('Write a note explaining why the account stays open. The user will see it.');
      return;
    }
    if (decision === 'approved' && !window.confirm(`Delete the account ${item.email}? This cannot be undone: personal details, documents and photos are removed and listings are taken down.`)) return;
    setBusyId(item.id);
    setError('');
    setNotice('');
    try {
      await api(`/admin/deletion-requests/${item.id}/decision`, { method: 'POST', body: JSON.stringify({ decision, note }) });
      setNotice(decision === 'approved' ? `${item.email} was deleted and anonymised.` : `The request from ${item.email} was rejected. They have been told why.`);
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
          <h1>Deletion requests</h1>
          <p>Users who asked for their account to be deleted (POPIA). Check for open reports or disputes, then approve without undue delay.</p>
        </div>
        <div className="tabs" role="tablist" aria-label="Request status">
          {tabs.map((tab) => (
            <button key={tab.value} className="tab" type="button" role="tab" aria-selected={status === tab.value} onClick={() => switchTab(tab.value)}>{tab.label}</button>
          ))}
        </div>
      </header>

      {error ? <p role="alert" className="alert error">{error}</p> : null}
      {notice ? <p role="status" className="alert success">{notice}</p> : null}
      {items === null && !error ? <p className="muted">Loading…</p> : null}
      {items?.length === 0 ? <div className="card empty">{status === 'pending' ? 'No deletion requests are waiting.' : 'Nothing here yet.'}</div> : null}

      <div className="stack">
        {items?.map((item) => (
          <article key={item.id} className="card stack" aria-labelledby={`deletion-${item.id}`}>
            <div className="row spread">
              <h3 id={`deletion-${item.id}`}>{item.email}</h3>
              <span className="pill">{item.role}</span>
            </div>
            <p className="muted">
              Member since {formatDateTime(item.memberSince)} · asked {formatDateTime(item.createdAt)}
              {item.reviewedAt ? ` · reviewed ${formatDateTime(item.reviewedAt)}` : ''}
            </p>
            {item.business ? <p className="muted">Business: {item.business.name} ({item.business.verificationStatus.replace('_', ' ')})</p> : null}
            {item.openReportsAgainstUser > 0 ? (
              <p className="alert error">{item.openReportsAgainstUser} open report{item.openReportsAgainstUser === 1 ? '' : 's'} about this user&apos;s listings. Review them under Reports before deciding.</p>
            ) : null}
            <div className="alert info"><strong>Reason given:</strong> {item.reason || 'No reason given.'}</div>
            {item.decisionNote ? <p className="muted">Administrator note: {item.decisionNote}</p> : null}

            {item.status === 'pending' ? (
              <>
                <div className="field">
                  <label htmlFor={`note-${item.id}`}>Note (required to reject; the user sees it)</label>
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
                  <button className="button danger small" type="button" disabled={busyId === item.id} onClick={() => decide(item, 'approved')}>Approve and delete</button>
                  <button className="button secondary small" type="button" disabled={busyId === item.id} onClick={() => decide(item, 'rejected')}>Reject</button>
                </div>
              </>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
