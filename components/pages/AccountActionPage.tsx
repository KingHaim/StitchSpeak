import React, { useEffect, useState } from 'react';
import { acceptInvite, confirmPasswordReset, verifyEmail } from '../../services/api';
import { analyticsErrorCode, captureEvent } from '../../services/analytics';

interface AccountActionPageProps {
  mode: 'verify' | 'reset' | 'invite';
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
        captureEvent('signup_completed', { method: 'email' });
        setStatus('success');
        setMessage('Your email is verified and your account is ready.');
      })
      .catch((err) => {
        captureEvent('signup_failed', { method: 'email', error_code: analyticsErrorCode(err) });
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'This verification link is invalid or expired.');
      });
  }, [mode, token]);

  const submitPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) {
      setStatus('error');
      setMessage(mode === 'invite' ? 'This invite link is incomplete.' : 'This password-reset link is incomplete.');
      return;
    }
    setStatus('working');
    try {
      if (mode === 'invite') {
        captureEvent('signup_started', { method: 'invite' });
        await acceptInvite(token, password);
        captureEvent('signup_completed', { method: 'invite' });
        setStatus('success');
        setMessage('Your password is set and your account is ready.');
      } else {
        await confirmPasswordReset(token, password);
        setStatus('success');
        setMessage('Your password has been changed. Sign in with the new password.');
      }
    } catch (err) {
      if (mode === 'invite') {
        captureEvent('signup_failed', { method: 'invite', error_code: analyticsErrorCode(err) });
      }
      setStatus('error');
      setMessage(
        err instanceof Error
          ? err.message
          : mode === 'invite'
            ? 'This invite link is invalid or expired.'
            : 'This password-reset link is invalid or expired.',
      );
    }
  };

  const title =
    mode === 'verify' ? 'Verify your email' : mode === 'invite' ? 'Create your password' : 'Choose a new password';
  const passwordLabel = mode === 'invite' ? 'Password' : 'New password';
  const submitLabel = mode === 'invite' ? 'Create password' : 'Reset password';

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-10 text-on-surface">
      <section className="w-full max-w-md rounded-3xl border border-outline-variant/20 bg-surface-container-lowest p-6 shadow-xl sm:p-8">
        <img src="/logo.png" alt="" className="mb-6 h-12 w-12" />
        <h1 className="font-headline text-3xl font-bold">{title}</h1>
        {mode === 'invite' && status !== 'success' && (
          <p className="mt-3 text-sm text-on-surface-variant">
            Choose a password to finish joining the StitchSpeak designer beta. Your starter credits are already on the account.
          </p>
        )}

        {(mode === 'reset' || mode === 'invite') && status !== 'success' && (
          <form onSubmit={submitPassword} className="mt-6 space-y-4">
            <label className="block text-sm font-medium">
              {passwordLabel}
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
              {status === 'working' ? 'Saving…' : submitLabel}
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
