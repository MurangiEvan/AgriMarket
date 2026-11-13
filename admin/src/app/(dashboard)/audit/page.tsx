'use client';

import { useEffect, useState } from 'react';

import { api, auditLabel, errorMessage, formatDateTime } from '@/lib/api';

type AuditItem = {
  id: string;
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  createdAt: string;
};

type Filters = { action: string; targetType: string; before: string };

const PAGE_SIZE = 50;

// Action filters match by prefix on the server, so "verification." covers every verification event.
const actionOptions = [
  { value: '', label: 'All actions' },
  { value: 'application.submitted', label: 'Application submitted' },
  { value: 'verification.', label: 'All verification events' },
  { value: 'verification.approved', label: 'Business approved' },
  { value: 'verification.rejected', label: 'Business rejected' },
  { value: 'verification.document.read', label: 'Document opened' },
  { value: 'listing.', label: 'All photo and listing events' },
  { value: 'listing.published', label: 'Photo published' },
  { value: 'listing.rejected', label: 'Photo rejected' },
  { value: 'export.', label: 'Data exports' },
  { value: 'user.', label: 'All account events' },
  { value: 'user.password_reset', label: 'Password reset' },
];

const targetOptions = [
  { value: '', label: 'Anything' },
  { value: 'verification_submission', label: 'Verification submission' },
  { value: 'listing', label: 'Listing' },
  { value: 'user', label: 'User account' },
  { value: 'export', label: 'Data export' },
];

function buildQuery(filters: Filters, before?: string) {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (filters.action) params.set('action', filters.action);
  if (filters.targetType) params.set('targetType', filters.targetType);
  // "Up to" a date includes that whole day.
  const cursor = before ?? (filters.before ? new Date(`${filters.before}T23:59:59.999`).toISOString() : '');
  if (cursor) params.set('before', cursor);
  return `/admin/audit-logs?${params.toString()}`;
}

export default function AuditPage() {
  const [filters, setFilters] = useState<Filters>({ action: '', targetType: '', before: '' });
  const [applied, setApplied] = useState<Filters>(filters);
  const [items, setItems] = useState<AuditItem[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Ignore a slow response for filters the admin has already changed.
    let current = true;
    api<AuditItem[]>(buildQuery(applied))
      .then((rows) => {
        if (!current) return;
        setItems(rows);
        setHasMore(rows.length === PAGE_SIZE);
      })
      .catch((cause: unknown) => { if (current) setError(errorMessage(cause, 'The audit log could not be loaded.')); });
    return () => { current = false; };
  }, [applied]);

  function apply(next: Filters) {
    setItems(null);
    setError('');
    setApplied(next);
  }

  async function loadMore() {
    const last = items?.at(-1);
    if (!last) return;
    setLoadingMore(true);
    try {
      const rows = await api<AuditItem[]>(buildQuery(applied, last.createdAt));
      setItems((current) => [...(current ?? []), ...rows]);
      setHasMore(rows.length === PAGE_SIZE);
    } catch (cause) {
      setError(errorMessage(cause, 'Older events could not be loaded.'));
    } finally {
      setLoadingMore(false);
    }
  }

  const reset = { action: '', targetType: '', before: '' };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Audit log</h1>
          <p>Every administrator decision, document view and password reset, newest first.</p>
        </div>
      </header>

      <form
        className="card"
        style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', alignItems: 'end' }}
        onSubmit={(event) => { event.preventDefault(); apply(filters); }}
        aria-label="Filter audit events"
      >
        <div className="field">
          <label htmlFor="action">Action</label>
          <select id="action" className="input" value={filters.action} onChange={(event) => setFilters({ ...filters, action: event.target.value })}>
            {actionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="target">About</label>
          <select id="target" className="input" value={filters.targetType} onChange={(event) => setFilters({ ...filters, targetType: event.target.value })}>
            {targetOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="before">Up to date</label>
          <input id="before" className="input" type="date" value={filters.before} onChange={(event) => setFilters({ ...filters, before: event.target.value })} />
        </div>
        <div className="row">
          <button className="button primary" type="submit">Apply filters</button>
          <button className="button secondary" type="button" onClick={() => { setFilters(reset); apply(reset); }}>Clear</button>
        </div>
      </form>

      {error ? <p role="alert" className="alert error">{error}</p> : null}

      <section className="card" aria-label="Audit events">
        {items === null && !error ? <p className="muted">Loading…</p> : null}
        {items?.length === 0 ? <p className="empty">No events match these filters.</p> : null}
        {items && items.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th scope="col">When</th><th scope="col">Event</th><th scope="col">About</th><th scope="col">By</th></tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(item.createdAt)}</td>
                    <td><strong>{auditLabel(item.action)}</strong><br /><code>{item.action}</code></td>
                    <td>{targetOptions.find((option) => option.value === item.targetType)?.label ?? item.targetType}<br /><code title={item.targetId}>{item.targetId.slice(0, 8)}</code></td>
                    <td>{item.actorId ? <code title={item.actorId}>{item.actorId.slice(0, 8)}</code> : <span className="muted">System</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {hasMore ? (
          <div className="row" style={{ justifyContent: 'center', paddingTop: 14 }}>
            <button className="button secondary" type="button" disabled={loadingMore} onClick={loadMore}>{loadingMore ? 'Loading…' : 'Load older events'}</button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
