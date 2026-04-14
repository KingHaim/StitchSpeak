import { useState } from 'react'

interface PaymentModalProps {
  onComplete: () => void
  onClose: () => void
}

export default function PaymentModal({ onComplete, onClose }: PaymentModalProps) {
  const [step, setStep] = useState<'info' | 'processing' | 'success'>('info')
  const [cardNumber, setCardNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvc, setCvc] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setStep('processing')
    setTimeout(() => {
      setStep('success')
      setTimeout(() => {
        onComplete()
      }, 1500)
    }, 2000)
  }

  const formatCardNumber = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 16)
    return digits.replace(/(\d{4})(?=\d)/g, '$1 ')
  }

  const formatExpiry = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 4)
    if (digits.length > 2) return `${digits.slice(0, 2)}/${digits.slice(2)}`
    return digits
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl cursor-pointer"
        >
          ✕
        </button>

        {step === 'info' && (
          <>
            <div className="text-center mb-6">
              <div className="text-4xl mb-3">💳</div>
              <h3 className="text-xl font-bold text-gray-800">Premium Translation</h3>
              <p className="text-gray-600 text-sm mt-1">
                One-time payment for pattern translation
              </p>
              <div className="mt-3 text-3xl font-bold text-purple-600">$4.99</div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-6 text-xs text-amber-700 text-center">
              ⚠️ This is a <strong>simulation</strong>. No real payment will be processed.
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Card Number</label>
                <input
                  type="text"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                  placeholder="4242 4242 4242 4242"
                  required
                  className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Expiry</label>
                  <input
                    type="text"
                    value={expiry}
                    onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                    placeholder="MM/YY"
                    required
                    className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">CVC</label>
                  <input
                    type="text"
                    value={cvc}
                    onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="123"
                    required
                    className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors cursor-pointer"
              >
                Pay $4.99
              </button>
            </form>
          </>
        )}

        {step === 'processing' && (
          <div className="text-center py-8 space-y-4">
            <div className="animate-spin mx-auto w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full" />
            <p className="text-purple-600 font-medium">Processing payment...</p>
          </div>
        )}

        {step === 'success' && (
          <div className="text-center py-8 space-y-4">
            <div className="text-5xl">✅</div>
            <p className="text-green-600 font-bold text-lg">Payment Successful!</p>
            <p className="text-gray-600 text-sm">Redirecting to your translation...</p>
          </div>
        )}
      </div>
    </div>
  )
}
