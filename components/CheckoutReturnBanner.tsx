import React from 'react';
import type { CheckoutReturnStatus } from '../contexts/credit-context';
import { SUPPORT_EMAIL } from '../services/checkoutReconciliation';
import { websiteCopy, type WebsiteLocale } from '../utils/websiteLocalization';

interface CheckoutReturnBannerProps {
  status: Exclude<CheckoutReturnStatus, null>;
  locale?: WebsiteLocale;
  onRetry: () => void;
  onDismiss: () => void;
}

export const CheckoutReturnBanner: React.FC<CheckoutReturnBannerProps> = ({
  status,
  locale,
  onRetry,
  onDismiss,
}) => {
  const copy = websiteCopy(locale).checkoutReturn;
  const title =
    status === 'confirming' ? copy.confirmingTitle
      : status === 'confirmed' ? copy.confirmedTitle
        : copy.delayedTitle;
  const body =
    status === 'confirming' ? copy.confirmingBody
      : status === 'confirmed' ? copy.confirmedBody
        : copy.delayedBody;

  return (
    <div
      className="mx-auto mb-6 flex max-w-5xl items-start justify-between gap-4 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-on-surface"
      role="status"
      data-testid="checkout-return-banner"
    >
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-on-surface-variant">{body}</p>
        {status === 'delayed' && (
          <p className="mt-2 text-on-surface-variant">
            {copy.supportLead}{' '}
            <a
              className="font-semibold text-primary underline underline-offset-2"
              href={`mailto:${SUPPORT_EMAIL}`}
            >
              {SUPPORT_EMAIL}
            </a>
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row">
        {status === 'delayed' && (
          <button type="button" onClick={onRetry} className="font-semibold text-primary hover:underline">
            {copy.retry}
          </button>
        )}
        <button type="button" onClick={onDismiss} className="font-semibold text-primary hover:underline">
          {copy.dismiss}
        </button>
      </div>
    </div>
  );
};
