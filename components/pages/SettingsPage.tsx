import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/auth-context';
import { useCredits } from '../../contexts/credit-context';
import { deleteAccount, downloadAccountExport } from '../../services/accountService';
import { requestPasswordReset } from '../../services/api';
import { loadHistory } from '../../services/historyService';
import type { CreditPackage, TranslationRecord } from '../../types';
import { BuyCreditsModal } from '../BuyCreditsModal';
import { CreditsOverviewModal } from '../CreditsOverviewModal';
import { DeleteAccountModal } from '../DeleteAccountModal';

export const SettingsPage: React.FC = () => {
  const { user, idToken, signOut } = useAuth();
  const { balance, startCheckout } = useCredits();

  const [avatarFailed, setAvatarFailed] = useState(false);
  const [showBuyCredits, setShowBuyCredits] = useState(false);
  const [showCreditsOverview, setShowCreditsOverview] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<TranslationRecord[]>([]);

  const [exportingData, setExportingData] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [resettingPassword, setResettingPassword] = useState(false);
  const [passwordResetNotice, setPasswordResetNotice] = useState<string | null>(null);
  const [passwordResetError, setPasswordResetError] = useState<string | null>(null);

  const displayName = user?.name?.trim() || 'Maker';
  const avatarInitial = (displayName[0] ?? user?.email?.[0] ?? '?').toUpperCase();
  const showAvatarImage = Boolean(user?.picture && !avatarFailed);
  const isEmailAccount = Boolean(user?.sub?.startsWith('email:'));
  const balanceLabel = balance % 1 === 0 ? balance.toString() : balance.toFixed(1);

  useEffect(() => {
    setAvatarFailed(false);
  }, [user?.picture]);

  useEffect(() => {
    if (!showCreditsOverview) return;
    let cancelled = false;
    loadHistory(idToken)
      .then(({ records }) => {
        if (!cancelled) setHistoryRecords(records);
      })
      .catch((err) => {
        console.error('Failed to load patterns for credits overview:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [showCreditsOverview, idToken]);

  const handlePurchase = async (pack: CreditPackage) => {
    await startCheckout(pack.id);
  };

  const handleExportData = async () => {
    if (!idToken || exportingData) return;
    setExportingData(true);
    setExportError(null);
    setExportNotice(null);
    try {
      await downloadAccountExport(idToken);
      setExportNotice('Your data export has started downloading.');
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Could not export your data.');
    } finally {
      setExportingData(false);
    }
  };

  const handleDeleteAccount = async (confirmation: string) => {
    if (!idToken || deletingAccount) return;
    setDeletingAccount(true);
    setDeleteError(null);
    try {
      await deleteAccount(idToken, confirmation);
      setShowDeleteAccount(false);
      signOut();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete your account.');
    } finally {
      setDeletingAccount(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!user?.email || resettingPassword) return;
    setResettingPassword(true);
    setPasswordResetError(null);
    setPasswordResetNotice(null);
    try {
      await requestPasswordReset(user.email);
      setPasswordResetNotice('If that account exists, a password-reset link is on its way.');
    } catch (err) {
      setPasswordResetError(err instanceof Error ? err.message : 'Could not send a password-reset email.');
    } finally {
      setResettingPassword(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-10 animate-in fade-in duration-300">
      <section aria-labelledby="settings-profile-heading">
        <h2 id="settings-profile-heading" className="font-headline text-2xl text-on-surface">
          Profile
        </h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          How you appear across StitchSpeak.
        </p>
        <div className="mt-5 flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-outline-variant/40 bg-surface-container-high">
            {showAvatarImage ? (
              <img
                src={user?.picture}
                alt=""
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
                onError={() => setAvatarFailed(true)}
              />
            ) : (
              <span className="text-xl font-semibold text-primary">{avatarInitial}</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-on-surface">{displayName}</p>
            {user?.email && (
              <p className="truncate text-sm text-on-surface-variant">{user.email}</p>
            )}
            <p className="mt-1 text-xs text-on-surface-variant/80">
              {isEmailAccount ? 'Signed in with email' : 'Signed in with Google'}
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="settings-credits-heading">
        <h2 id="settings-credits-heading" className="font-headline text-2xl text-on-surface">
          Credits
        </h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Check your balance and top up when you need more translations.
        </p>
        <div className="mt-5 divide-y divide-outline-variant/30 border-y border-outline-variant/30">
          <div className="flex items-center justify-between gap-4 py-4">
            <div>
              <p className="text-sm font-semibold text-on-surface">Current balance</p>
              <p className="text-xs text-on-surface-variant">{balanceLabel} credits available</p>
            </div>
            <span className="text-2xl font-bold tabular-nums text-primary">{balanceLabel}</span>
          </div>
          <SettingsRow
            icon="insights"
            title="View usage"
            description="See estimated translations remaining"
            onClick={() => setShowCreditsOverview(true)}
          />
          <SettingsRow
            icon="add_circle"
            title="Buy credits"
            description="Purchase a credit pack"
            onClick={() => setShowBuyCredits(true)}
          />
        </div>
      </section>

      <section aria-labelledby="settings-billing-heading">
        <h2 id="settings-billing-heading" className="font-headline text-2xl text-on-surface">
          Billing
        </h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Review your credit purchases and payment documents.
        </p>
        <div className="mt-5 border-y border-outline-variant/30">
          <SettingsLinkRow
            icon="receipt_long"
            title="Invoices"
            description="View orders, receipts, and downloadable invoices"
            href="https://app.lemonsqueezy.com/my-orders"
          />
        </div>
      </section>

      {isEmailAccount && user?.email && (
        <section aria-labelledby="settings-security-heading">
          <h2 id="settings-security-heading" className="font-headline text-2xl text-on-surface">
            Security
          </h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            Manage how you sign in to your account.
          </p>
          <div className="mt-5 border-y border-outline-variant/30">
            <SettingsRow
              icon="lock_reset"
              title="Reset password"
              description="Email yourself a secure reset link"
              onClick={() => void handlePasswordReset()}
              busy={resettingPassword}
              busyLabel="Sending…"
            />
          </div>
          {passwordResetNotice && (
            <p className="mt-3 text-sm text-primary" role="status">{passwordResetNotice}</p>
          )}
          {passwordResetError && (
            <p className="mt-3 text-sm text-red-700" role="alert">{passwordResetError}</p>
          )}
        </section>
      )}

      <section aria-labelledby="settings-data-heading">
        <h2 id="settings-data-heading" className="font-headline text-2xl text-on-surface">
          Your data
        </h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Download a copy of your patterns, chats, and account details.
        </p>
        <div className="mt-5 border-y border-outline-variant/30">
          <SettingsRow
            icon="download"
            title="Download my data"
            description="Export a ZIP of your account data"
            onClick={() => void handleExportData()}
            busy={exportingData}
            busyLabel="Preparing export…"
          />
        </div>
        {exportNotice && (
          <p className="mt-3 text-sm text-primary" role="status">{exportNotice}</p>
        )}
        {exportError && (
          <p className="mt-3 text-sm text-red-700" role="alert">{exportError}</p>
        )}
      </section>

      <section aria-labelledby="settings-session-heading">
        <h2 id="settings-session-heading" className="font-headline text-2xl text-on-surface">
          Session
        </h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Sign out of StitchSpeak on this device.
        </p>
        <div className="mt-5 border-y border-outline-variant/30">
          <SettingsRow
            icon="logout"
            title="Sign out"
            description="End your current session"
            onClick={() => signOut()}
          />
        </div>
      </section>

      <section aria-labelledby="settings-danger-heading">
        <h2 id="settings-danger-heading" className="font-headline text-2xl text-red-800">
          Danger zone
        </h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Permanently remove your account and associated data.
        </p>
        <div className="mt-5 border-y border-red-200/80">
          <SettingsRow
            icon="delete_forever"
            title="Delete account"
            description="This cannot be undone"
            onClick={() => {
              setDeleteError(null);
              setShowDeleteAccount(true);
            }}
            destructive
          />
        </div>
      </section>

      <BuyCreditsModal
        isOpen={showBuyCredits}
        onClose={() => setShowBuyCredits(false)}
        onPurchase={handlePurchase}
      />
      <CreditsOverviewModal
        isOpen={showCreditsOverview}
        onClose={() => setShowCreditsOverview(false)}
        onTopUp={() => setShowBuyCredits(true)}
        balance={balance}
        records={historyRecords}
      />
      <DeleteAccountModal
        isOpen={showDeleteAccount}
        isDeleting={deletingAccount}
        error={deleteError}
        onClose={() => setShowDeleteAccount(false)}
        onConfirm={(confirmation) => void handleDeleteAccount(confirmation)}
      />
    </div>
  );
};

interface SettingsRowProps {
  icon: string;
  title: string;
  description: string;
  onClick: () => void;
  busy?: boolean;
  busyLabel?: string;
  destructive?: boolean;
}

const SettingsRow: React.FC<SettingsRowProps> = ({
  icon,
  title,
  description,
  onClick,
  busy = false,
  busyLabel,
  destructive = false,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={busy}
    className={`flex w-full items-center gap-3 py-4 text-left transition-colors disabled:opacity-60 ${
      destructive
        ? 'hover:bg-red-50/70'
        : 'hover:bg-surface-container-high/60'
    }`}
  >
    <span
      className={`material-symbols-outlined text-[22px] shrink-0 ${
        destructive ? 'text-red-700' : 'text-primary'
      }`}
      aria-hidden
    >
      {icon}
    </span>
    <span className="min-w-0 flex-1">
      <span
        className={`block text-sm font-semibold ${
          destructive ? 'text-red-800' : 'text-on-surface'
        }`}
      >
        {busy && busyLabel ? busyLabel : title}
      </span>
      <span className="block text-xs text-on-surface-variant">{description}</span>
    </span>
    <span
      className={`material-symbols-outlined text-lg shrink-0 ${
        destructive ? 'text-red-400' : 'text-on-surface-variant/60'
      }`}
      aria-hidden
    >
      chevron_right
    </span>
  </button>
);

interface SettingsLinkRowProps {
  icon: string;
  title: string;
  description: string;
  href: string;
}

const SettingsLinkRow: React.FC<SettingsLinkRowProps> = ({
  icon,
  title,
  description,
  href,
}) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    aria-label={`${title} (opens in a new tab)`}
    className="flex w-full items-center gap-3 py-4 text-left transition-colors hover:bg-surface-container-high/60"
  >
    <span
      className="material-symbols-outlined shrink-0 text-[22px] text-primary"
      aria-hidden
    >
      {icon}
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-semibold text-on-surface">{title}</span>
      <span className="block text-xs text-on-surface-variant">{description}</span>
    </span>
    <span
      className="material-symbols-outlined shrink-0 text-lg text-on-surface-variant/60"
      aria-hidden
    >
      open_in_new
    </span>
  </a>
);
