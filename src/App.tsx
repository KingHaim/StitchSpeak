import { useState } from 'react'
import Header from './components/Header'
import PdfUploader from './components/PdfUploader'
import TranslationPanel from './components/TranslationPanel'
import KnittingAssistant from './components/KnittingAssistant'
import PaymentModal from './components/PaymentModal'

export type AppView = 'upload' | 'translation' | 'assistant'

function App() {
  const [view, setView] = useState<AppView>('upload')
  const [extractedText, setExtractedText] = useState('')
  const [translatedText, setTranslatedText] = useState('')
  const [targetLanguage, setTargetLanguage] = useState('Spanish')
  const [showPayment, setShowPayment] = useState(false)
  const [hasPaid, setHasPaid] = useState(false)

  const handlePdfExtracted = (text: string) => {
    setExtractedText(text)
    if (hasPaid) {
      setView('translation')
    } else {
      setShowPayment(true)
    }
  }

  const handlePaymentComplete = () => {
    setHasPaid(true)
    setShowPayment(false)
    setView('translation')
  }

  const handleTranslationComplete = (translated: string) => {
    setTranslatedText(translated)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-amber-50">
      <Header view={view} setView={setView} hasPattern={!!extractedText} />

      <main className="max-w-5xl mx-auto px-4 py-8">
        {view === 'upload' && (
          <PdfUploader onTextExtracted={handlePdfExtracted} />
        )}

        {view === 'translation' && (
          <TranslationPanel
            originalText={extractedText}
            targetLanguage={targetLanguage}
            setTargetLanguage={setTargetLanguage}
            onTranslationComplete={handleTranslationComplete}
          />
        )}

        {view === 'assistant' && (
          <KnittingAssistant translatedText={translatedText} />
        )}
      </main>

      {showPayment && (
        <PaymentModal
          onComplete={handlePaymentComplete}
          onClose={() => setShowPayment(false)}
        />
      )}
    </div>
  )
}

export default App
