import React, { useEffect, useState } from 'react';
import { confirmPasswordReset, verifyEmail } from '../../services/api';

interface AccountActionPageProps {
  mode: 'verify' | 'reset';
}

export const AccountActionPage: React.FC<AccountActionPageProps> = ({ mode }) => {
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const [status, setStatus] = useState<'working' | 'ready' | 'success' | 'error'>(mode === 'verify' ? 'working' : 'ready');
  const [message, setMessage] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (mode !== 'verify') return;
    if (!token) {
      setStatus('error');
      setMessage('This verification link is incomplete.');
      return;
    }
    void verifyEmail(token)
      .then(() => {
        setStatus('success');
        setMessage('Your email is verified and your account is ready.');
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'This verification link is invalid or expired.');
      });
  }, [mode, token]);

  const submitReset = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) {
      setStatus('error');
      setMessage('This password-reset link is incomplete.');
      return;
    }
    setStatus('working');
    try {
      await confirmPasswordReset(token, password);
      setStatus('success');
      setMessage('Your password has been changed. Sign in with the new password.');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'This password-reset link is invalid or expired.');
    }
  };

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-10 text-on-surface">
      <section className="w-full max-w-md rounded-3xl border border-outline-variant/20 bg-surface-container-lowest p-6 shadow-xl sm:p-8">
        <img src="/logo.png" alt="" className="mb-6 h-12 w-12" />
        <h1 className="font-headline text-3xl font-bold">
          {mode === 'verify' ? 'Verify your email' : 'Choose a new password'}
        </h1>

        {mode === 'reset' && status !== 'success' && (
          <form onSubmit={submitReset} className="mt-6 space-y-4">
            <label className="block text-sm font-medium">
              New password
              <input
                type="password"
                required
                minLength={10}
                maxLength={128}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 w-full rounded-xl border border-outline-variant/40 bg-surface px-4 py-3 outline-none focus:border-primary"
              />
            </label>
            <button disabled={status === 'working'} className="min-h-12 w-full rounded-xl bg-primary px-5 py-3 font-bold text-on-primary disabled:opacity-50">
              {status === 'working' ? 'Saving…' : 'Reset password'}
            </button>
          </form>
        )}

        {mode === 'verify' && status === 'working' && <p className="mt-5 text-on-surface-variant">Verifying your email…</p>}
        {message && <p role={status === 'error' ? 'alert' : 'status'} className={`mt-5 rounded-xl px-4 py-3 text-sm ${status === 'error' ? 'bg-error-container text-on-error-container' : 'bg-primary/10'}`}>{message}</p>}
        {status === 'success' && <a href="/" className="mt-6 flex min-h-12 items-center justify-center rounded-xl bg-primary px-5 py-3 font-bold text-on-primary">Continue to StitchSpeak</a>}
      </section>
    </main>
  );
};
