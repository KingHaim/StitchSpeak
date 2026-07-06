const ID_TOKEN_KEY = 'stitchspeak_google_id_token';
const SESSION_TOKEN_KEY = 'ss_token';

// Persisted in localStorage (not sessionStorage) so the session survives tab
// closes and browser restarts. The session only ends when the user explicitly
// signs out; while it is alive the token is silently renewed before expiry.
export function readStoredIdToken(): string | null {
  try {
    return localStorage.getItem(SESSION_TOKEN_KEY) || localStorage.getItem(ID_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function writeStoredIdToken(token: string): void {
  try {
    localStorage.setItem(ID_TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

export function clearStoredIdToken(): void {
  try {
    localStorage.removeItem(ID_TOKEN_KEY);
    localStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}
