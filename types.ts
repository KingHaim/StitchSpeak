
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
