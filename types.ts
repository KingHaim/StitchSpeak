
export interface Language {
  code: string;
  name: string;
}

export interface ChatMessage {
  author: 'user' | 'model';
  content: string;
}

export interface PdfMetrics {
  pages: number;
  characters: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  fileSizeKB: number;
}

export type FileMetrics = PdfMetrics;

export interface PriceEstimate {
  translationCost: number;
  chatPackageCost: number;
  totalCost: number;
  breakdown: {
    inputTokens: number;
    outputTokens: number;
    rawCost: number;
    margin: number;
  };
}

export interface TranslationResult {
  html: string;
  usage: {
    promptTokens: number;
    candidateTokens: number;
    totalTokens: number;
  } | null;
}

export type PageId = 'dashboard' | 'glossary' | 'history';

export interface GlossaryTerm {
  id: string;
  category: 'basic' | 'stitch' | 'technique' | 'tool' | 'measurement' | 'construction' | 'crochet';
  terms: Record<string, {
    abbreviation: string;
    full: string;
  }>;
}

export interface TranslationRecord {
  id: string;
  timestamp: number;
  fileName: string;
  fileType: string;
  sourceLanguage?: string;
  targetLanguage: string;
  translatedHtml?: string;
  pdfMetrics: PdfMetrics | null;
  cost: number;
  /** True when the original source file is stored server-side and can be re-fetched. */
  hasSource?: boolean;
  /** True when a page-1 thumbnail has been generated and stored server-side. */
  hasThumbnail?: boolean;
}

export interface CreditPackage {
  credits: number;
  price: number;
  label: string;
}

export type TranslationJobStatus = 'translating' | 'complete' | 'error';

export interface TranslationJob {
  id: string;
  file: File;
  fileName: string;
  sourceLanguage: Language;
  targetLanguage: Language;
  pdfMetrics: PdfMetrics | null;
  priceEstimate: PriceEstimate | null;
  status: TranslationJobStatus;
  translatedHtml: string;
  error: string | null;
  chatSessionId: string | null;
  chatHistory: ChatMessage[];
  chatMessageCount: number;
  chatMessagesAllowed: number;
}

export interface PendingTranslationStart {
  file: File;
  sourceLanguage: Language;
  targetLanguage: Language;
  pdfMetrics: PdfMetrics | null;
  priceEstimate: PriceEstimate;
}
