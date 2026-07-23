import React, { useEffect, useState } from 'react';
import { CloseIcon } from './icons/CloseIcon';
import { sendFeedback } from '../services/api';
import { useModalA11y } from '../hooks/useModalA11y';

const MAX_LENGTH = 4000;

interface FeedbackDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FeedbackDialog: React.FC<FeedbackDialogProps> = ({ isOpen, onClose }) => {
  const dialogRef = useModalA11y(isOpen, onClose);
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMessage('');
      setIsSending(false);
      setSent(false);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || isSending) return;
    setError(null);
    setIsSending(true);
    try {
      await sendFeedback(trimmed);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your feedback. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="feedback-dialog-title">
      <div className="absolute inset-0 bg-inverse-surface/60 backdrop-blur-sm" onClick={onClose}></div>

      <div className="relative w-full max-w-md bg-surface-container-lowest rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 max-h-[92vh] flex flex-col">
        <div className="bg-surface-container-low p-4 sm:p-6 border-b border-outline-variant/20 flex justify-between items-center">
          <div className="pr-3">
            <h3 id="feedback-dialog-title" className="text-lg font-bold text-on-surface">Send feedback</h3>
            <p className="text-xs text-on-surface-variant">Found a bug or have a question? It goes straight to the team.</p>
          </div>
          <button onClick={onClose} className="text-on-surface-variant/70 hover:text-on-surface transition shrink-0" aria-label="Close">
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>

        {sent ? (
          <div className="p-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <span className="material-symbols-outlined text-2xl text-primary" aria-hidden>mark_email_read</span>
            </div>
            <p className="text-on-surface font-semibold mb-1">Thank you!</p>
            <p className="text-sm text-on-surface-variant mb-5">Your feedback has been sent. We may reply to your account email.</p>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 px-4 bg-primary hover:bg-primary-container text-on-primary font-bold rounded-lg shadow-md shadow-primary/15 transition-all"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto flex-1">
            <label htmlFor="feedback-message" className="block text-sm font-medium text-on-surface mb-2">
              Your feedback or question
            </label>
            <textarea
              id="feedback-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={MAX_LENGTH}
              rows={5}
              required
              placeholder="Describe the problem, idea, or question…"
              className="w-full rounded-xl border-2 border-outline-variant/40 bg-surface-container-lowest focus:border-primary focus:outline-none p-3 text-sm text-on-surface placeholder:text-on-surface-variant/60 resize-y"
            />
            <p className="mt-1 mb-4 text-right text-[11px] text-on-surface-variant/70">{message.length}/{MAX_LENGTH}</p>

            {error && (
              <div className="text-red-500 text-sm text-center bg-red-50 py-2 rounded-lg mb-4">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSending || message.trim().length === 0}
              className="w-full flex items-center justify-center py-3.5 px-4 bg-primary hover:bg-primary-container text-on-primary font-bold rounded-lg shadow-md shadow-primary/15 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isSending ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-on-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Sending…
                </span>
              ) : (
                'Send feedback'
              )}
            </button>
            <p className="mt-3 text-center text-[11px] text-on-surface-variant/70">
              Your account ID and email are included so we can follow up.
            </p>
          </form>
        )}
      </div>
    </div>
  );
};
