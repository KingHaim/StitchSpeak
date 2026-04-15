
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

export type PageId =
  | 'dashboard'
  | 'glossary'
  | 'history'
  | 'portfolio'
  | 'projects'
  | 'community'
  | 'messages'
  | 'notifications'
  | 'saved'
  | 'profile'
  | 'settings';

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
  targetLanguage: string;
  translatedHtml: string;
  pdfMetrics: PdfMetrics | null;
  cost: number;
}
