import React, { useCallback, useState } from 'react';
import { useModalA11y } from '../hooks/useModalA11y';

interface DeleteAccountModalProps {
  isOpen: boolean;
  isDeleting: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (confirmation: string) => void;
}

export const DeleteAccountModal: React.FC<DeleteAccountModalProps> = ({
  isOpen, isDeleting, error, onClose, onConfirm,
}) => {
  const [confirmation, setConfirmation] = useState('');
  const close = useCallback(() => {
    if (isDeleting) return;
    setConfirmation('');
    onClose();
  }, [isDeleting, onClose]);
  const modalRef = useModalA11y(isOpen, close);

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4" onMouseDown={close}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
        className="w-full max-w-lg rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="delete-account-title" className="font-headline text-3xl text-brand-900">Delete your account?</h2>
        <p className="mt-3 text-sm leading-6 text-brand-600">
          This permanently removes your patterns, chats, uploaded files, credentials, and remaining credits. Financial records required for accounting are retained only with an anonymized identifier.
        </p>
        <label className="mt-5 block text-sm font-semibold text-brand-800" htmlFor="delete-confirmation">
          Type <span className="font-mono">DELETE</span> to confirm
        </label>
        <input
          id="delete-confirmation"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          autoComplete="off"
          className="mt-2 min-h-12 w-full rounded-xl border border-brand-300 px-4 text-base outline-none focus:border-red-500 focus:ring-2 focus:ring-red-200"
        />
        {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={close} disabled={isDeleting} className="min-h-12 rounded-xl px-5 font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50">Cancel</button>
          <button
            type="button"
            onClick={() => onConfirm(confirmation)}
            disabled={confirmation !== 'DELETE' || isDeleting}
            className="min-h-12 rounded-xl bg-red-700 px-5 font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isDeleting ? 'Deleting…' : 'Permanently delete account'}
          </button>
        </div>
      </div>
    </div>
  );
};
