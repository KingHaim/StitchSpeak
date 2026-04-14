import type { AuthenticatedUser, GoogleIdTokenPayload } from './types';

function base64UrlToJson(segment: string): GoogleIdTokenPayload {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const json = atob(padded);
  return JSON.parse(json) as GoogleIdTokenPayload;
}

export function decodeGoogleIdToken(credential: string): GoogleIdTokenPayload {
  const parts = credential.split('.');
  if (parts.length < 2) {
    throw new Error('Invalid Google credential');
  }
  return base64UrlToJson(parts[1]);
}

export function isPayloadExpired(payload: GoogleIdTokenPayload): boolean {
  if (payload.exp == null) return false;
  return payload.exp * 1000 <= Date.now();
}

export function payloadToUser(payload: GoogleIdTokenPayload): AuthenticatedUser {
  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
  };
}
