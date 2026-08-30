import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { AuthenticatedUser } from '../auth/types';
import { clearStoredIdToken } from '../auth/sessionStorage';
import { getGoogleOAuthClientId } from '../auth/googleConfig';
import { initializeGoogleIdentity } from '../auth/googleIdentity';
import { COOKIE_SESSION_AUTH_MARKER } from '../services/apiBase';
import { migrateGuestHistoryToServerIfRemoteEmpty } from '../services/historyService';
import { getMe, googleLogin, login, logout, register } from '../services/api';
import {
  analyticsErrorCode,
  captureEvent,
  identifyUser,
  resetAnalyticsIdentity,
  setAnalyticsAuthState,
} from '../services/analytics';
import { AuthContext, type AuthContextValue } from './auth-context';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  // Existing service signatures use this as an authenticated-session marker;
  // it is not a credential and contains no secret material.
  const [idToken, setIdToken] = useState<string | null>(null);
  const [googleIdentityReady, setGoogleIdentityReady] = useState(false);

  const signOut = useCallback(() => {
    try { window.google?.accounts?.id?.disableAutoSelect?.(); } catch { /* ignore */ }
    clearStoredIdToken();
    resetAnalyticsIdentity();
    setUser(null);
    setIdToken(null);
    void logout().catch(() => undefined);
  }, []);

  const signInWithGoogleCredential = useCallback((credential: string) => {
    captureEvent('sign_in_started', { method: 'google' });
    void googleLogin(credential).then((result) => {
      if (!result.user) throw new Error('The server did not create a session.');
      clearStoredIdToken();
      setUser(result.user as AuthenticatedUser);
      setIdToken(COOKIE_SESSION_AUTH_MARKER);
      if (result.isNewUser) {
        captureEvent('signup_started', { method: 'google' });
        captureEvent('signup_completed', { method: 'google' });
      } else {
        captureEvent('sign_in_completed', { method: 'google' });
      }
    }).catch((error) => {
      captureEvent('sign_in_failed', { method: 'google', error_code: analyticsErrorCode(error) });
      signOut();
    });
  }, [signOut]);

  const signInWithEmail = useCallback(async (email: string, password: string, createAccount: boolean, name?: string) => {
    if (createAccount) {
      const registration = await register(email, password, name);
      if (registration.verificationRequired) {
        captureEvent('signup_verification_requested', { method: 'email' });
        return { verificationRequired: true, developmentVerificationUrl: registration.developmentVerificationUrl };
      }
    }
    const result = await login(email, password);
    if (!result.user) throw new Error('The server did not create a session.');
    clearStoredIdToken();
    setIdToken(COOKIE_SESSION_AUTH_MARKER);
    setUser(result.user as AuthenticatedUser);
    captureEvent(createAccount ? 'signup_completed' : 'sign_in_completed', { method: 'email' });
    return { verificationRequired: false };
  }, []);

  useEffect(() => {
    void getMe().then((result) => {
      if (!result.user) return;
      clearStoredIdToken();
      setUser(result.user as AuthenticatedUser);
      setIdToken(COOKIE_SESSION_AUTH_MARKER);
    }).catch(() => clearStoredIdToken());
  }, []);

  useEffect(() => {
    const clientId = getGoogleOAuthClientId();
    if (!clientId) return;
    const attempt = () => {
      const ready = initializeGoogleIdentity(clientId, (response) => {
        if (response.credential) signInWithGoogleCredential(response.credential);
      });
      if (ready) setGoogleIdentityReady(true);
      return ready;
    };
    if (attempt()) return;
    const interval = window.setInterval(() => {
      if (attempt()) window.clearInterval(interval);
    }, 100);
    return () => window.clearInterval(interval);
  }, [signInWithGoogleCredential]);

  useEffect(() => {
    setAnalyticsAuthState(user != null && idToken != null);
  }, [user, idToken]);

  useEffect(() => {
    if (idToken) void migrateGuestHistoryToServerIfRemoteEmpty(idToken);
  }, [idToken]);

  // Covers every sign-in path (Google, email, session bootstrap) in one place.
  useEffect(() => {
    if (user) identifyUser(user);
  }, [user]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    idToken,
    isAuthenticated: user != null && idToken != null,
    googleIdentityReady,
    signInWithGoogleCredential,
    signInWithEmail,
    signOut,
  }), [user, idToken, googleIdentityReady, signInWithGoogleCredential, signInWithEmail, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
