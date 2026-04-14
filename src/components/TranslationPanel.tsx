import { useState, useEffect, useCallback } from 'react'
import { translatePattern } from '../services/gemini'

interface TranslationPanelProps {
  originalText: string
  targetLanguage: string
  setTargetLanguage: (lang: string) => void
  onTranslationComplete: (translated: string) => void
}

const LANGUAGES = [
  'Spanish', 'French', 'German', 'Italian', 'Portuguese',
  'Japanese', 'Korean', 'Chinese', 'Swedish', 'Norwegian',
  'Danish', 'Finnish', 'Dutch', 'Russian', 'Polish',
]

export default function TranslationPanel({
  originalText,
  targetLanguage,
  setTargetLanguage,
  onTranslationComplete,
}: TranslationPanelProps) {
  const [translatedText, setTranslatedText] = useState('')
  const [isTranslating, setIsTranslating] = useState(false)
  const [error, setError] = useState('')

  const handleTranslate = useCallback(async () => {
    if (!originalText) return

    setIsTranslating(true)
    setError('')

    try {
      const result = await translatePattern(originalText, targetLanguage)
      setTranslatedText(result)
      onTranslationComplete(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Translation failed'
      setError(message)
    } finally {
      setIsTranslating(false)
    }
  }, [originalText, targetLanguage, onTranslationComplete])

  useEffect(() => {
    handleTranslate()
  }, [handleTranslate])

  const formatAlternating = (text: string): string => {
    return text.replace(
      /(\d+)\s*\((\d+)\)\s*(\d+)\s*\((\d+)\)/g,
      '<span class="font-bold">$1</span> <span class="text-purple-600">($2)</span> <span class="font-bold">$3</span> <span class="text-purple-600">($4)</span>'
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-800">Pattern Translation</h2>
        <div className="flex items-center gap-3">
          <label htmlFor="language" className="text-sm font-medium text-gray-600">
            Translate to:
          </label>
          <select
            id="language"
            value={targetLanguage}
            onChange={(e) => setTargetLanguage(e.target.value)}
            className="px-4 py-2 rounded-xl border border-purple-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>{lang}</option>
            ))}
          </select>
          <button
            onClick={handleTranslate}
            disabled={isTranslating}
            className="px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {isTranslating ? 'Translating...' : 'Translate'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
            Original Pattern
          </h3>
          <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
            {originalText}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-purple-100">
          <h3 className="text-sm font-semibold text-purple-500 uppercase tracking-wider mb-4">
            {targetLanguage} Translation
          </h3>
          {isTranslating ? (
            <div className="flex items-center gap-3 text-purple-600">
              <div className="animate-spin w-5 h-5 border-2 border-purple-200 border-t-purple-600 rounded-full" />
              <span className="text-sm">Translating with AI...</span>
            </div>
          ) : (
            <div
              className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ __html: formatAlternating(translatedText) }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
