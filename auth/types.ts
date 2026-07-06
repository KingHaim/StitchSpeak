/** Fields commonly present on a Google ID token (JWT) payload. */
export type GoogleIdTokenPayload = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
  exp?: number;
};

export type AuthenticatedUser = {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
};

export type EmailAuthResult = {
  token: string;
  user: AuthenticatedUser;
};
