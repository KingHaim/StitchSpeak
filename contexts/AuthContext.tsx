import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { AuthenticatedUser } from '../auth/types';
import { clearStoredIdToken } from '../auth/sessionStorage';
import { getGoogleOAuthClientId } from '../auth/googleConfig';
import { initializeGoogleIdentity } from '../auth/googleIdentity';
import { migrateGuestHistoryToServerIfRemoteEmpty } from '../services/historyService';
import { getMe, googleLogin, login, logout, register } from '../services/api';
import { AuthContext, type AuthContextValue } from './auth-context';

const COOKIE_SESSION = 'cookie-session';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  // Existing service signatures use this as an authenticated-session marker;
  // it is not a credential and contains no secret material.
  const [idToken, setIdToken] = useState<string | null>(null);
  const [googleIdentityReady, setGoogleIdentityReady] = useState(false);

  const signOut = useCallback(() => {
    try { window.google?.accounts?.id?.disableAutoSelect?.(); } catch { /* ignore */ }
    clearStoredIdToken();
    setUser(null);
    setIdToken(null);
    void logout().catch(() => undefined);
  }, []);

  const signInWithGoogleCredential = useCallback((credential: string) => {
    void googleLogin(credential).then((result) => {
      if (!result.user) throw new Error('The server did not create a session.');
      clearStoredIdToken();
      setUser(result.user as AuthenticatedUser);
      setIdToken(COOKIE_SESSION);
    }).catch(() => signOut());
  }, [signOut]);

  const signInWithEmail = useCallback(async (email: string, password: string, createAccount: boolean, name?: string) => {
    if (createAccount) {
      const registration = await register(email, password, name);
      if (registration.verificationRequired) {
        return { verificationRequired: true, developmentVerificationUrl: registration.developmentVerificationUrl };
      }
    }
    const result = await login(email, password);
    if (!result.user) throw new Error('The server did not create a session.');
    clearStoredIdToken();
    setIdToken(COOKIE_SESSION);
    setUser(result.user as AuthenticatedUser);
    return { verificationRequired: false };
  }, []);

  useEffect(() => {
    void getMe().then((result) => {
      if (!result.user) return;
      clearStoredIdToken();
      setUser(result.user as AuthenticatedUser);
      setIdToken(COOKIE_SESSION);
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
    if (idToken) void migrateGuestHistoryToServerIfRemoteEmpty(idToken);
  }, [idToken]);

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
