import crypto from 'node:crypto';

/**
 * US9 AC3 bypass: Vercel's proxied rewrite (`/api/:path*` → Railway) has a
 * documented maximum request timeout of 120 seconds with no config knob to
 * raise it — far under the ~240s a PDF + recovery + US7-verifier job needs.
 * The translate stream therefore bypasses the rewrite: the client mints one
 * of these short-lived tokens over the same-origin rewrite (fast, HttpOnly
 * cookie auth still works there) and starts the long-running stream directly
 * against the Railway origin with the token as a Bearer credential.
 *
 * The token is deliberately narrow: single purpose, short TTL, bound to the
 * authenticated user, HMAC-signed. It is not a session and grants nothing
 * beyond starting a translation.
 */

const TOKEN_PREFIX = 'sst_';

/**
 * Long enough to cover minting the token and starting the upload (auth runs
 * as soon as request headers arrive, before the body finishes uploading),
 * short enough that a leaked token is stale almost immediately.
 */
export const TRANSLATION_STREAM_TOKEN_TTL_MS = 5 * 60 * 1000;

// Signed with the same stable secret as email sessions when configured. The
// dev fallback is a per-process random secret: fine, because tokens are minted
// seconds before use against the same process.
const signingSecret: string =
  process.env.AUTH_SESSION_SECRET?.trim() || crypto.randomBytes(32).toString('base64url');

interface StreamTokenClaims {
  sub: string;
  provider: 'google' | 'email';
  purpose: 'translate-stream';
  exp: number;
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', signingSecret).update(payload).digest('base64url');
}

export function isTranslationStreamToken(token: string): boolean {
  return token.startsWith(TOKEN_PREFIX);
}

export function createTranslationStreamToken(
  sub: string,
  identityProvider: 'google' | 'email',
  now = Date.now(),
): string {
  const claims: StreamTokenClaims = {
    sub,
    provider: identityProvider,
    purpose: 'translate-stream',
    exp: now + TRANSLATION_STREAM_TOKEN_TTL_MS,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${TOKEN_PREFIX}${payload}.${sign(payload)}`;
}

export function verifyTranslationStreamToken(
  token: string,
  now = Date.now(),
): { sub: string; identityProvider: 'google' | 'email' } | null {
  if (!isTranslationStreamToken(token)) return null;
  const [payload, signature] = token.slice(TOKEN_PREFIX.length).split('.');
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const given = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !crypto.timingSafeEqual(given, wanted)) return null;

  let claims: StreamTokenClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as StreamTokenClaims;
  } catch {
    return null;
  }
  if (claims.purpose !== 'translate-stream') return null;
  if (typeof claims.sub !== 'string' || claims.sub.length === 0) return null;
  if (typeof claims.exp !== 'number' || claims.exp <= now) return null;

  return {
    sub: claims.sub,
    identityProvider: claims.provider === 'email' ? 'email' : 'google',
  };
}

/**
 * The public origin the client should stream against directly (bypassing the
 * Vercel rewrite). Explicit `TRANSLATE_DIRECT_ORIGIN` wins; otherwise Railway's
 * own `RAILWAY_PUBLIC_DOMAIN` is used. When neither is set the client keeps
 * using the same-origin rewrite (status quo — correct for local dev).
 */
export function translationStreamDirectOrigin(): string | null {
  const configured = process.env.TRANSLATE_DIRECT_ORIGIN?.trim().replace(/\/+$/, '');
  if (configured) return configured;
  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim().replace(/\/+$/, '');
  if (railwayDomain) return `https://${railwayDomain}`;
  return null;
}
