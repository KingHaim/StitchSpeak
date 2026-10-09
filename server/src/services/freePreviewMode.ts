import { isAdminIdentity } from '../middleware/admin.js';

/**
 * US10 dark-launch flag. Default `off` keeps current paid-job behaviour and
 * hides the preview UI. `admins` is for production soak on ADMIN_EMAILS.
 * `on` opens the flow to every signed-in account.
 *
 * Read from the environment on every call so tests (and a process-level
 * flip) do not require a restart.
 */
export type FreePreviewMode = 'off' | 'admins' | 'on';

export interface FreePreviewIdentity {
  userSub?: string;
  userEmail?: string;
  identityProvider?: 'google' | 'email';
  emailVerified?: boolean;
  /** Set when the request was authenticated by a US9 stream token. */
  freePreviewEligibleFromToken?: boolean;
}

export function getFreePreviewMode(): FreePreviewMode {
  const raw = (process.env.FREE_PREVIEW_MODE || '').trim().toLowerCase();
  if (raw === 'on' || raw === 'admins') return raw;
  return 'off';
}

/**
 * Whether this identity may start the free-preview / unlock flow.
 * Mode `off` always wins, including for a stream token minted earlier.
 */
export function canOfferFreePreview(identity: FreePreviewIdentity): boolean {
  const mode = getFreePreviewMode();
  if (mode === 'off') return false;
  if (mode === 'on') return true;
  if (
    isAdminIdentity({
      userEmail: identity.userEmail,
      identityProvider: identity.identityProvider ?? 'email',
      emailVerified: identity.emailVerified ?? false,
    })
  ) {
    return true;
  }
  return identity.freePreviewEligibleFromToken === true;
}
