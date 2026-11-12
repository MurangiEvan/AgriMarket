'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { api, errorMessage, type AdminUser } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [slow, setSlow] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    // The free Render service sleeps when idle; tell the admin why the first sign-in can be slow.
    const slowTimer = window.setTimeout(() => setSlow(true), 6000);
    try {
      const { user } = await api<{ user: AdminUser }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (user.role !== 'admin') {
        await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
        setError('This website is for AgriMarket administrators only. Sellers and buyers should use the AgriMarket app.');
        return;
      }
      router.replace('/');
    } catch (cause) {
      setError(errorMessage(cause, 'Sign-in failed. Please try again.'));
    } finally {
      window.clearTimeout(slowTimer);
      setSlow(false);
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <form className="auth-card" onSubmit={submit} aria-labelledby="login-title">
        <div className="row">
          <span className="brand-mark" aria-hidden="true">A</span>
          <span className="label">AgriMarket · Administrators</span>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <h1 id="login-title">Sign in</h1>
          <p className="muted">Review seller verifications, approve produce photos and check the audit log.</p>
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" className="input" type="email" autoComplete="username" required placeholder="e.g. admin@agrimarket.co.za" value={email} onChange={(event) => setEmail(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" className="input" type="password" autoComplete="current-password" required placeholder="Your administrator password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </div>
        {error ? <p role="alert" className="alert error">{error}</p> : null}
        {slow ? <p role="status" className="alert info">Waking up the AgriMarket server. The first sign-in can take up to a minute.</p> : null}
        <button className="button primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  );
}
