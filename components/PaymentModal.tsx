import React, { useState, useEffect } from 'react';
import { CloseIcon } from './icons/CloseIcon';
import { CreditCardIcon } from './icons/CreditCardIcon';
import { LockIcon } from './icons/LockIcon';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  price: number;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({ isOpen, onClose, onSuccess, price }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setCardNumber('');
      setExpiry('');
      setCvc('');
      setError(null);
      setIsProcessing(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = v.match(/\d{4,16}/g);
    const match = matches && matches[0] || '';
    const parts = [];
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }
    if (parts.length) {
      return parts.join(' ');
    } else {
      return value;
    }
  };

  const handleCardChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val.length < 20) {
        setCardNumber(formatCardNumber(val));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsProcessing(true);

    // --- CREEM PAYMENT SIMULATION ---
    // In production, this would redirect to Creem checkout or use their API.
    // Creem handles tax collection and remittance automatically.
    
    // Simulating network request delay and validation
    setTimeout(() => {
      if (cardNumber.replace(/\s/g, '').length < 16) {
        setError('Please enter a valid card number.');
        setIsProcessing(false);
        return;
      }
      
      // Success!
      setIsProcessing(false);
      onSuccess();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
      
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden transform transition-all animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="bg-slate-50 p-6 border-b border-slate-100 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-100 rounded-full">
               <LockIcon className="w-5 h-5 text-brand-600" />
            </div>
            <div>
                <h3 className="text-lg font-bold text-slate-800">Unlock Translation</h3>
                <p className="text-xs text-slate-500">Secure Payment via Creem</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
            <div className="mb-6 text-center">
                <p className="text-slate-500 mb-1">Total Amount</p>
                <p className="text-4xl font-bold text-slate-800">${price.toFixed(2)}</p>
                <p className="text-xs text-brand-600 mt-2 font-medium px-3 py-1 bg-brand-50 inline-block rounded-full">
                    One-time translation fee
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Card Number</label>
                    <div className="relative">
                        <input 
                            type="text" 
                            placeholder="0000 0000 0000 0000"
                            className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
                            value={cardNumber}
                            onChange={handleCardChange}
                            required
                        />
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <CreditCardIcon className="h-5 w-5 text-slate-400" />
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Expiration</label>
                        <input 
                            type="text" 
                            placeholder="MM / YY"
                            className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
                            value={expiry}
                            onChange={(e) => setExpiry(e.target.value)}
                            maxLength={5}
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">CVC</label>
                        <div className="relative">
                            <input 
                                type="text" 
                                placeholder="123"
                                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
                                value={cvc}
                                onChange={(e) => setCvc(e.target.value)}
                                maxLength={4}
                                required
                            />
                            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                <LockIcon className="h-4 w-4 text-slate-400" />
                            </div>
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="text-red-500 text-sm text-center bg-red-50 py-2 rounded-lg">
                        {error}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={isProcessing}
                    className="w-full flex items-center justify-center py-3.5 px-4 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-lg shadow-md transition-all transform hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none mt-2"
                >
                    {isProcessing ? (
                        <span className="flex items-center">
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Processing...
                        </span>
                    ) : (
                        `Pay $${price.toFixed(2)} & Translate`
                    )}
                </button>
            </form>
        </div>
        
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-100 text-center">
             <p className="text-xs text-slate-400 flex items-center justify-center gap-1">
                <LockIcon className="w-3 h-3" />
                Payments securely processed by Creem
             </p>
        </div>
      </div>
    </div>
  );
};