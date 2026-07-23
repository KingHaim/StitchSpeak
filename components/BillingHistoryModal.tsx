import React, { useEffect, useState } from 'react';
import {
  getBillingOrders,
  getBillingReceiptUrl,
  type BillingOrder,
} from '../services/creditService';
import { useModalA11y } from '../hooks/useModalA11y';
import { CloseIcon } from './icons/CloseIcon';

const ORDER_PORTAL_URL = 'https://app.lemonsqueezy.com/my-orders';

interface BillingHistoryModalProps {
  isOpen: boolean;
  idToken: string | null;
  onClose: () => void;
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(timestamp));
}

function formatCredits(credits: number): string {
  return Number.isInteger(credits) ? String(credits) : credits.toFixed(1);
}

function formatEuro(cents: number): string {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

function refundLabel(order: BillingOrder): string | null {
  if (order.refundedAmountCents <= 0) return null;
  if (order.refundedAmountCents >= order.amountPaidCents) return 'Refunded';
  return `${formatEuro(order.refundedAmountCents)} refunded`;
}

export const BillingHistoryModal: React.FC<BillingHistoryModalProps> = ({
  isOpen,
  idToken,
  onClose,
}) => {
  const dialogRef = useModalA11y(isOpen, onClose);
  const [orders, setOrders] = useState<BillingOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (!idToken) {
      setOrders([]);
      setError('Sign in again to view your invoices.');
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);
    getBillingOrders(idToken)
      .then(({ orders: nextOrders }) => {
        if (!cancelled) setOrders(nextOrders);
      })
      .catch((err) => {
        if (!cancelled) {
          setOrders([]);
          setError(err instanceof Error ? err.message : 'Could not load your invoices.');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, idToken]);

  if (!isOpen) return null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="billing-history-title"
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-slate-900/60 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close invoices"
      />

      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-outline-variant/40 bg-surface shadow-2xl sm:rounded-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-outline-variant/30 bg-surface-container-low px-5 py-5 sm:px-6">
          <div className="flex min-w-0 gap-3">
            <span
              className="material-symbols-outlined mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[21px] text-primary"
              aria-hidden
            >
              receipt_long
            </span>
            <div>
              <h3 id="billing-history-title" className="font-headline text-xl text-on-surface">
                Invoices
              </h3>
              <p className="mt-0.5 text-sm text-on-surface-variant">
                Receipts for your StitchSpeak credit purchases
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
            aria-label="Close"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-40 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {isLoading && (
            <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-on-surface-variant" role="status">
              <span className="material-symbols-outlined animate-spin text-xl text-primary" aria-hidden>
                progress_activity
              </span>
              Loading invoices…
            </div>
          )}

          {!isLoading && error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3" role="alert">
              <p className="text-sm font-semibold text-red-800">Invoices could not be loaded</p>
              <p className="mt-1 text-sm text-red-700">{error}</p>
            </div>
          )}

          {!isLoading && !error && orders.length === 0 && (
            <div className="flex min-h-40 flex-col items-center justify-center text-center">
              <span className="material-symbols-outlined text-3xl text-outline" aria-hidden>
                receipt
              </span>
              <p className="mt-2 text-sm font-semibold text-on-surface">No credit purchases yet</p>
              <p className="mt-1 max-w-xs text-sm text-on-surface-variant">
                Your receipts will appear here after your first credit purchase.
              </p>
            </div>
          )}

          {!isLoading && !error && orders.length > 0 && (
            <ul className="divide-y divide-outline-variant/30">
              {orders.map((order) => {
                const refund = refundLabel(order);
                return (
                  <li key={order.orderId} className="flex items-center gap-4 py-4 first:pt-1 last:pb-1">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="text-sm font-semibold text-on-surface">
                          {formatCredits(order.creditsGranted)} credits
                        </p>
                        {refund && (
                          <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-[11px] font-semibold text-on-surface-variant">
                            {refund}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-on-surface-variant">
                        {formatDate(order.createdAt)} · {formatEuro(order.amountPaidCents)}
                      </p>
                    </div>
                    <a
                      href={getBillingReceiptUrl(order.orderId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/30 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      aria-label={`Open invoice from ${formatDate(order.createdAt)} in a new tab`}
                    >
                      Open
                      <span className="material-symbols-outlined text-[16px]" aria-hidden>
                        open_in_new
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="border-t border-outline-variant/30 bg-surface-container-low px-5 py-3 sm:px-6">
          <p className="text-xs text-on-surface-variant">
            Can’t find a purchase?{' '}
            <a
              href={ORDER_PORTAL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary"
            >
              Open the order portal
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
};
