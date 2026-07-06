import React, { useEffect, useRef, useState } from 'react';
import { renderGoogleIdentityButton } from '../auth/googleIdentity';
import { useAuth } from '../contexts/AuthContext';
import { CloseIcon } from './icons/CloseIcon';
import { requestPasswordReset, resendVerification } from '../services/api';

interface AuthDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
}

export const AuthDialog: React.FC<AuthDialogProps> = ({ isOpen, onClose, title = 'Sign in to StitchSpeak' }) => {
  const { googleIdentityReady, signInWithEmail, isAuthenticated } = useAuth();
  const googleHost = useRef<HTMLDivElement>(null);
  const [createAccount, setCreateAccount] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [developmentUrl, setDevelopmentUrl] = useState<string | null>(null);
  const [canResendVerification, setCanResendVerification] = useState(false);

  useEffect(() => {
    if (!isOpen || !googleIdentityReady || !googleHost.current) return;
    renderGoogleIdentityButton(googleHost.current, {
      type: 'standard', theme: 'outline', size: 'large', text: 'continue_with',
      shape: 'rectangular', logo_alignment: 'left', width: 320,
    });
  }, [isOpen, googleIdentityReady]);

  useEffect(() => {
    if (isAuthenticated && isOpen) onClose();
  }, [isAuthenticated, isOpen, onClose]);

  if (!isOpen) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await signInWithEmail(email, password, createAccount, name);
      if (result.verificationRequired) {
        setNotice('Check your inbox and verify your email before signing in.');
        setDevelopmentUrl(result.developmentVerificationUrl ?? null);
        return;
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
      setCanResendVerification((err as { code?: string }).code === 'EMAIL_NOT_VERIFIED');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await resendVerification(email, password);
      setNotice('A fresh verification link is on its way.');
      setDevelopmentUrl(result.developmentVerificationUrl ?? null);
      setCanResendVerification(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend the verification email.');
    } finally {
      setBusy(false);
    }
  };

  const forgotPassword = async () => {
    if (!email.trim()) {
      setError('Enter your email address first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await requestPasswordReset(email);
      setNotice('If that account exists, a password-reset link is on its way.');
      setDevelopmentUrl(result.developmentResetUrl ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not request a password reset.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="auth-dialog-title">
      <button type="button" className="absolute inset-0 cursor-default border-0 bg-inverse-surface/50 p-0 backdrop-blur-sm" onClick={onClose} aria-label="Close dialog" />
      <div className="relative z-10 max-h-[94dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-outline-variant/20 bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl sm:p-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 id="auth-dialog-title" className="font-headline text-xl font-bold text-on-surface">{title}</h2>
            <p className="mt-1 text-sm text-on-surface-variant">Use Google, or continue with any email address.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container-high" aria-label="Close"><CloseIcon className="h-5 w-5" /></button>
        </div>

        {googleIdentityReady && <div ref={googleHost} className="mx-auto flex min-h-11 w-full max-w-[320px] justify-center" />}
        {googleIdentityReady && <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wider text-on-surface-variant"><span className="h-px flex-1 bg-outline-variant/30" />or<span className="h-px flex-1 bg-outline-variant/30" /></div>}

        <form onSubmit={submit} className="space-y-4">
          {createAccount && <label className="block text-sm font-medium">Name <span className="font-normal text-on-surface-variant">(optional)</span><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} className="mt-1.5 w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 outline-none focus:border-primary" /></label>}
          <label className="block text-sm font-medium">Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className="mt-1.5 w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 outline-none focus:border-primary" /></label>
          <label className="block text-sm font-medium">Password<input type="password" required minLength={10} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={createAccount ? 'new-password' : 'current-password'} className="mt-1.5 w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 outline-none focus:border-primary" /></label>
          {error && <p className="text-sm text-error" role="alert">{error}</p>}
          {notice && <p className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-on-surface" role="status">{notice}</p>}
          {developmentUrl && <a href={developmentUrl} className="block break-all text-sm font-medium text-primary underline">Open local development link</a>}
          {canResendVerification && <button type="button" onClick={() => void resend()} className="min-h-11 w-full rounded-xl border border-primary/30 px-4 py-2 text-sm font-semibold text-primary">Resend verification email</button>}
          <button type="submit" disabled={busy} className="min-h-12 w-full rounded-xl bg-primary px-6 py-3 font-bold text-on-primary shadow-lg shadow-primary/15 disabled:opacity-50">{busy ? 'Please wait…' : createAccount ? 'Create account' : 'Sign in with email'}</button>
        </form>
        {!createAccount && <button type="button" onClick={() => void forgotPassword()} className="mt-4 w-full text-center text-sm text-on-surface-variant hover:text-primary">Forgot password?</button>}
        <button type="button" onClick={() => { setCreateAccount((value) => !value); setError(null); }} className="mt-5 w-full text-center text-sm font-medium text-primary hover:underline">{createAccount ? 'Already have an account? Sign in' : 'New here? Create an account'}</button>
      </div>
    </div>
  );
};
