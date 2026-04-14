/** Web client ID from Google Cloud Console → APIs & Services → Credentials. */
export function getGoogleOAuthClientId(): string | undefined {
  const id = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  return typeof id === 'string' && id.trim() !== '' ? id.trim() : undefined;
}
