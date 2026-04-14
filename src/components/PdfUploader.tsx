import { useState, useRef } from 'react'

interface PdfUploaderProps {
  onTextExtracted: (text: string) => void
}

export default function PdfUploader({ onTextExtracted }: PdfUploaderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [fileName, setFileName] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    if (file.type !== 'application/pdf') {
      setError('Please upload a PDF file.')
      return
    }

    setError('')
    setFileName(file.name)
    setIsProcessing(true)

    try {
      const text = await extractTextFromPdf(file)
      if (!text.trim()) {
        setError('Could not extract text from this PDF. It may be image-based.')
        setIsProcessing(false)
        return
      }
      onTextExtracted(text)
    } catch {
      setError('Failed to process the PDF. Please try another file.')
    } finally {
      setIsProcessing(false)
    }
  }

  const extractTextFromPdf = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)
    const textParts: string[] = []

    let i = 0
    while (i < bytes.length) {
      if (bytes[i] === 0x42 && bytes[i + 1] === 0x54) {
        let j = i + 2
        while (j < bytes.length - 1) {
          if (bytes[j] === 0x45 && bytes[j + 1] === 0x54) {
            const block = new TextDecoder('latin1').decode(bytes.slice(i, j + 2))
            const matches = block.match(/\(([^)]*)\)/g)
            if (matches) {
              for (const m of matches) {
                textParts.push(m.slice(1, -1))
              }
            }
            break
          }
          j++
        }
        i = j + 2
      } else {
        i++
      }
    }

    if (textParts.length === 0) {
      const fullText = new TextDecoder('latin1').decode(bytes)
      const allParens = fullText.match(/\(([^)]{2,})\)/g)
      if (allParens) {
        for (const m of allParens) {
          const inner = m.slice(1, -1)
          if (/[a-zA-Z]{2,}/.test(inner)) {
            textParts.push(inner)
          }
        }
      }
    }

    return textParts.join(' ').replace(/\s+/g, ' ').trim()
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-800 mb-3">
          Translate Your Knitting Pattern
        </h2>
        <p className="text-gray-600">
          Upload a knitting pattern PDF and we&apos;ll translate it with accurate
          localized terminology.
        </p>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragging(false)
          const file = e.dataTransfer.files[0]
          if (file) handleFile(file)
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
          isDragging
            ? 'border-purple-500 bg-purple-50 scale-[1.02]'
            : 'border-purple-200 bg-white hover:border-purple-400 hover:bg-purple-50/50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
          }}
        />

        {isProcessing ? (
          <div className="space-y-4">
            <div className="animate-spin mx-auto w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full" />
            <p className="text-purple-600 font-medium">Processing {fileName}...</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-5xl">📄</div>
            <div>
              <p className="text-lg font-medium text-gray-700">
                Drop your knitting pattern PDF here
              </p>
              <p className="text-sm text-gray-500 mt-1">or click to browse</p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          {error}
        </div>
      )}

      {fileName && !isProcessing && !error && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm flex items-center gap-2">
          <span>✅</span> Loaded: {fileName}
        </div>
      )}
    </div>
  )
}
