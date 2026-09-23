import React from 'react';

interface EmptyCreditsBannerProps {
  onBuyCredits: () => void;
  message?: string;
}

export const EmptyCreditsBanner: React.FC<EmptyCreditsBannerProps> = ({
  onBuyCredits,
  message = "You're out of credits",
}) => {
  return (
    <div
      role="status"
      data-testid="empty-credits-banner"
      className="rounded-xl border border-error/20 bg-error-container/40 px-5 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
    >
      <p className="text-sm font-semibold text-on-error-container">{message}</p>
      <button
        type="button"
        onClick={onBuyCredits}
        className="shrink-0 inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-bold text-sm shadow-md shadow-primary/15 transition-all"
      >
        Buy credits
      </button>
    </div>
  );
};
