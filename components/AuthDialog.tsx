import React, { useEffect, useRef, useState } from 'react';
import { renderGoogleIdentityButton } from '../auth/googleIdentity';
import { useAuth } from '../contexts/auth-context';
import { CloseIcon } from './icons/CloseIcon';
import { requestPasswordReset, resendVerification } from '../services/api';
import type { WebsiteLocale } from '../utils/websiteLocalization';
import { analyticsErrorCode, captureEvent } from '../services/analytics';

interface AuthDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  locale?: WebsiteLocale;
  source?: string;
}

const AUTH_COPY = {
  en: {
    title: 'Sign in to StitchSpeak',
    subtitle: 'Use Google, or continue with any email address.',
    close: 'Close',
    or: 'or',
    name: 'Name',
    optional: '(optional)',
    email: 'Email',
    password: 'Password',
    wait: 'Please wait…',
    createAccount: 'Create account',
    signInWithEmail: 'Sign in with email',
    forgotPassword: 'Forgot password?',
    existingAccount: 'Already have an account? Sign in',
    newAccount: 'New here? Create an account',
    verificationNotice: 'Check your inbox and verify your email before signing in.',
    signInError: 'Could not sign in.',
    resendNotice: 'A fresh verification link is on its way.',
    resendError: 'Could not resend the verification email.',
    emailFirst: 'Enter your email address first.',
    resetNotice: 'If that account exists, a password-reset link is on its way.',
    resetError: 'Could not request a password reset.',
    developmentLink: 'Open local development link',
    resendVerification: 'Resend verification email',
  },
  es: {
    title: 'Inicia sesión en StitchSpeak',
    subtitle: 'Usa Google o continúa con cualquier dirección de correo.',
    close: 'Cerrar',
    or: 'o',
    name: 'Nombre',
    optional: '(opcional)',
    email: 'Correo electrónico',
    password: 'Contraseña',
    wait: 'Espera un momento…',
    createAccount: 'Crear cuenta',
    signInWithEmail: 'Iniciar sesión con correo',
    forgotPassword: '¿Has olvidado la contraseña?',
    existingAccount: '¿Ya tienes una cuenta? Inicia sesión',
    newAccount: '¿Primera vez aquí? Crea una cuenta',
    verificationNotice: 'Revisa tu bandeja de entrada y verifica tu correo antes de iniciar sesión.',
    signInError: 'No se ha podido iniciar sesión.',
    resendNotice: 'Te hemos enviado un nuevo enlace de verificación.',
    resendError: 'No se ha podido reenviar el correo de verificación.',
    emailFirst: 'Introduce primero tu correo electrónico.',
    resetNotice: 'Si la cuenta existe, recibirás un enlace para restablecer la contraseña.',
    resetError: 'No se ha podido solicitar el restablecimiento de la contraseña.',
    developmentLink: 'Abrir enlace de desarrollo local',
    resendVerification: 'Reenviar correo de verificación',
  },
} as const;

export const AuthDialog: React.FC<AuthDialogProps> = ({
  isOpen,
  onClose,
  title,
  locale = 'en',
  source = 'unknown',
}) => {
  const copy = AUTH_COPY[locale];
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
    if (isOpen) captureEvent('auth_dialog_opened', { source });
  }, [isOpen, source]);

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
    captureEvent(createAccount ? 'signup_started' : 'sign_in_started', { method: 'email' });
    try {
      const result = await signInWithEmail(email, password, createAccount, name);
      if (result.verificationRequired) {
        setNotice(copy.verificationNotice);
        setDevelopmentUrl(result.developmentVerificationUrl ?? null);
        return;
      }
      onClose();
    } catch (err) {
      captureEvent(createAccount ? 'signup_failed' : 'sign_in_failed', {
        method: 'email',
        error_code: analyticsErrorCode(err),
      });
      setError(err instanceof Error ? err.message : copy.signInError);
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
      setNotice(copy.resendNotice);
      setDevelopmentUrl(result.developmentVerificationUrl ?? null);
      setCanResendVerification(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.resendError);
    } finally {
      setBusy(false);
    }
  };

  const forgotPassword = async () => {
    if (!email.trim()) {
      setError(copy.emailFirst);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await requestPasswordReset(email);
      setNotice(copy.resetNotice);
      setDevelopmentUrl(result.developmentResetUrl ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.resetError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="auth-dialog-title">
      <button type="button" className="absolute inset-0 cursor-default border-0 bg-inverse-surface/50 p-0 backdrop-blur-sm" onClick={onClose} aria-label={copy.close} />
      <div className="relative z-10 max-h-[94dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-outline-variant/20 bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl sm:p-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 id="auth-dialog-title" className="font-headline text-xl font-bold text-on-surface">{title ?? copy.title}</h2>
            <p className="mt-1 text-sm text-on-surface-variant">{copy.subtitle}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container-high" aria-label={copy.close}><CloseIcon className="h-5 w-5" /></button>
        </div>

        {googleIdentityReady && <div ref={googleHost} className="mx-auto flex min-h-11 w-full max-w-[320px] justify-center" />}
        {googleIdentityReady && <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wider text-on-surface-variant"><span className="h-px flex-1 bg-outline-variant/30" />{copy.or}<span className="h-px flex-1 bg-outline-variant/30" /></div>}

        <form onSubmit={submit} className="space-y-4">
          {createAccount && <label className="block text-sm font-medium">{copy.name} <span className="font-normal text-on-surface-variant">{copy.optional}</span><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} className="mt-1.5 w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 outline-none focus:border-primary" /></label>}
          <label className="block text-sm font-medium">{copy.email}<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className="mt-1.5 w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 outline-none focus:border-primary" /></label>
          <label className="block text-sm font-medium">{copy.password}<input type="password" required minLength={10} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={createAccount ? 'new-password' : 'current-password'} className="mt-1.5 w-full rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-4 py-3 outline-none focus:border-primary" /></label>
          {error && <p className="text-sm text-error" role="alert">{error}</p>}
          {notice && <p className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-on-surface" role="status">{notice}</p>}
          {developmentUrl && <a href={developmentUrl} className="block break-all text-sm font-medium text-primary underline">{copy.developmentLink}</a>}
          {canResendVerification && <button type="button" onClick={() => void resend()} className="min-h-11 w-full rounded-xl border border-primary/30 px-4 py-2 text-sm font-semibold text-primary">{copy.resendVerification}</button>}
          <button type="submit" disabled={busy} className="min-h-12 w-full rounded-xl bg-primary px-6 py-3 font-bold text-on-primary shadow-lg shadow-primary/15 disabled:opacity-50">{busy ? copy.wait : createAccount ? copy.createAccount : copy.signInWithEmail}</button>
        </form>
        {!createAccount && <button type="button" onClick={() => void forgotPassword()} className="mt-4 w-full text-center text-sm text-on-surface-variant hover:text-primary">{copy.forgotPassword}</button>}
        <button type="button" onClick={() => { setCreateAccount((value) => !value); setError(null); }} className="mt-5 w-full text-center text-sm font-medium text-primary hover:underline">{createAccount ? copy.existingAccount : copy.newAccount}</button>
      </div>
    </div>
  );
};
