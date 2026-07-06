import { createContext, useContext } from 'react';
import type { AuthenticatedUser } from '../auth/types';

export type AuthContextValue = {
  user: AuthenticatedUser | null;
  idToken: string | null;
  isAuthenticated: boolean;
  googleIdentityReady: boolean;
  signInWithGoogleCredential: (credential: string) => void;
  signInWithEmail: (email: string, password: string, createAccount: boolean, name?: string) => Promise<{ verificationRequired: boolean; developmentVerificationUrl?: string }>;
  signOut: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
