import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { AuthenticatedUser } from '../auth/types';
import {
  decodeGoogleIdToken,
  isPayloadExpired,
  payloadToUser,
} from '../auth/googleCredential';
import {
  readStoredIdToken,
  writeStoredIdToken,
  clearStoredIdToken,
} from '../auth/sessionStorage';

type AuthContextValue = {
  user: AuthenticatedUser | null;
  idToken: string | null;
  isAuthenticated: boolean;
  signInWithGoogleCredential: (credential: string) => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);

  const signOut = useCallback(() => {
    clearStoredIdToken();
    setUser(null);
    setIdToken(null);
  }, []);

  const signInWithGoogleCredential = useCallback(
    (credential: string) => {
      const payload = decodeGoogleIdToken(credential);
      if (isPayloadExpired(payload)) {
        signOut();
        return;
      }
      writeStoredIdToken(credential);
      setIdToken(credential);
      setUser(payloadToUser(payload));
    },
    [signOut],
  );

  useEffect(() => {
    const stored = readStoredIdToken();
    if (!stored) return;
    try {
      const payload = decodeGoogleIdToken(stored);
      if (isPayloadExpired(payload)) {
        clearStoredIdToken();
        return;
      }
      setIdToken(stored);
      setUser(payloadToUser(payload));
    } catch {
      clearStoredIdToken();
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      idToken,
      isAuthenticated: user != null && idToken != null,
      signInWithGoogleCredential,
      signOut,
    }),
    [user, idToken, signInWithGoogleCredential, signOut],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
