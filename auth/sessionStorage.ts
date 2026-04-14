const ID_TOKEN_KEY = 'stitchspeak_google_id_token';

export function readStoredIdToken(): string | null {
  try {
    return sessionStorage.getItem(ID_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function writeStoredIdToken(token: string): void {
  try {
    sessionStorage.setItem(ID_TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

export function clearStoredIdToken(): void {
  try {
    sessionStorage.removeItem(ID_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}
