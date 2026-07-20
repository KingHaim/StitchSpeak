import {
  createInvitedEmailAccount,
  emailAccountNeedsPassword,
  findEmailAccountByEmail,
  issueInviteToken,
  type EmailAccount,
} from './emailAuth.js';
import { inviteUrl, sendInviteEmail } from './authEmail.js';
import { adjustMemberCredits } from './adminStore.js';
import { addCredits, getBalance } from './creditStore.js';
import {
  approveBetaApplicationByEmail,
  markBetaInvite,
  wasBetaStarterGranted,
} from './betaApplicationStore.js';

export const BETA_STARTER_CREDITS = 50;
const STARTER_REASON = 'Beta starter credits';

export type BetaInviteResult = {
  account: EmailAccount;
  creditsGranted: boolean;
  balance: number;
  emailSent: boolean;
  developmentInviteUrl?: string;
  alreadyActive: boolean;
};

function developmentUrl(url: string): string | undefined {
  return process.env.NODE_ENV === 'production' ? undefined : url;
}

/**
 * Create (or reuse) an invited email account, grant 50 starter credits once,
 * and send the set-password invite email.
 */
export async function inviteBetaUser(params: {
  email: string;
  name?: string;
  actorEmail: string;
}): Promise<BetaInviteResult> {
  const email = params.email.trim().toLowerCase();
  const name = params.name?.trim().slice(0, 80) || undefined;

  let account = findEmailAccountByEmail(email);
  const alreadyActive = Boolean(account && !emailAccountNeedsPassword(email));

  if (!account) {
    account = createInvitedEmailAccount(email, name);
  } else if (name && !account.name) {
    // Name is optional metadata; leave existing accounts unchanged.
  }

  approveBetaApplicationByEmail(email, params.actorEmail);
  markBetaInvite(email, account.sub, false);

  let creditsGranted = false;
  if (!wasBetaStarterGranted(email)) {
    adjustMemberCredits(account.sub, BETA_STARTER_CREDITS, STARTER_REASON, params.actorEmail, email);
    markBetaInvite(email, account.sub, true);
    creditsGranted = true;
  } else {
    addCredits(account.sub, 0, email);
  }

  const balance = getBalance(account.sub);

  let emailSent = false;
  let developmentInviteUrl: string | undefined;
  if (!alreadyActive) {
    const token = issueInviteToken(account);
    try {
      await sendInviteEmail(account, token);
      emailSent = true;
    } catch (error) {
      console.error('[beta-invite] Invite email failed:', error);
    }
    developmentInviteUrl = developmentUrl(inviteUrl(token));
  }

  return {
    account,
    creditsGranted,
    balance,
    emailSent,
    ...(developmentInviteUrl ? { developmentInviteUrl } : {}),
    alreadyActive,
  };
}
