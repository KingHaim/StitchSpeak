import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
import { getGoogleOAuthClientId } from '../auth/googleConfig';
import { initializeGoogleIdentity } from '../auth/googleIdentity';
import { migrateGuestHistoryToServerIfRemoteEmpty } from '../services/historyService';

// Begin silently renewing the Google ID token this long before it expires.
const RENEW_BEFORE_MS = 5 * 60 * 1000;
// After the token has fully expired, keep trying to silently renew for this
// long before giving up and signing the user out.
const EXPIRED_GRACE_MS = 60 * 1000;
// Don't call google.accounts.id.prompt() more often than this.
const PROMPT_THROTTLE_MS = 60 * 1000;

type AuthContextValue = {
  user: AuthenticatedUser | null;
  idToken: string | null;
  isAuthenticated: boolean;
  googleIdentityReady: boolean;
  signInWithGoogleCredential: (credential: string) => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [googleIdentityReady, setGoogleIdentityReady] = useState(false);

  const lastPromptRef = useRef(0);
  const expiredSinceRef = useRef<number | null>(null);

  const signOut = useCallback(() => {
    // Explicit sign-out is the only thing that ends a session, so make sure
    // GIS won't immediately auto-select the user back in.
    try {
      window.google?.accounts?.id?.disableAutoSelect?.();
    } catch {
      /* ignore */
    }
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

  // Initialize the page-global GIS client exactly once. The script loads
  // asynchronously, so retry briefly until GoogleOAuthProvider has installed
  // window.google. All rendered buttons and silent renewal share this config.
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
    const stored = readStoredIdToken();
    if (!stored) return;
    try {
      const payload = decodeGoogleIdToken(stored);
      // Even if the stored token has expired, keep the user signed in and let
      // the renewal watchdog try to silently refresh it. It only signs the
      // user out if renewal fails within the grace window.
      if (!isPayloadExpired(payload)) {
        setUser(payloadToUser(payload));
      }
      setIdToken(stored);
    } catch {
      clearStoredIdToken();
    }
  }, []);

  // Renewal watchdog: Google ID tokens are only valid for ~1 hour. To keep the
  // user signed in until they explicitly sign out, we silently renew the token
  // shortly before it expires (and keep trying for a grace window after it has
  // expired). The user is only signed out if renewal genuinely fails.
  useEffect(() => {
    if (!idToken) return;

    const tryRenew = () => {
      const now = Date.now();
      if (now - lastPromptRef.current < PROMPT_THROTTLE_MS) return;
      if (!googleIdentityReady) return;
      lastPromptRef.current = now;
      try {
        window.google?.accounts?.id?.prompt?.();
      } catch {
        /* ignore — handled by the grace-window fallback */
      }
    };

    const check = () => {
      let expMs: number | null = null;
      try {
        const payload = decodeGoogleIdToken(idToken);
        expMs = payload.exp != null ? payload.exp * 1000 : null;
      } catch {
        signOut();
        return;
      }

      // No expiry claim: nothing to renew.
      if (expMs == null) return;

      const now = Date.now();
      if (now >= expMs) {
        // Expired: attempt silent renewal, but give up after the grace window.
        if (expiredSinceRef.current == null) expiredSinceRef.current = now;
        tryRenew();
        if (now - expiredSinceRef.current > EXPIRED_GRACE_MS) signOut();
      } else {
        expiredSinceRef.current = null;
        if (expMs - now <= RENEW_BEFORE_MS) tryRenew();
      }
    };

    check();
    const interval = window.setInterval(check, 30_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [idToken, signOut, googleIdentityReady]);

  useEffect(() => {
    if (!idToken) return;
    void migrateGuestHistoryToServerIfRemoteEmpty(idToken);
  }, [idToken]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      idToken,
      isAuthenticated: user != null && idToken != null,
      googleIdentityReady,
      signInWithGoogleCredential,
      signOut,
    }),
    [user, idToken, googleIdentityReady, signInWithGoogleCredential, signOut],
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
