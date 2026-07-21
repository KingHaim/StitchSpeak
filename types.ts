
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
    pageSurcharge: number;
  };
}

export interface TranslationResult {
  html: string;
  usage: {
    promptTokens: number;
    candidateTokens: number;
    totalTokens: number;
  } | null;
  /** Credits charged for this translation (server-authoritative). */
  cost?: number;
  /** Remaining credit balance after this translation, returned by the server. */
  balance?: number;
}

export type PageId = 'dashboard' | 'glossary' | 'history' | 'techedit' | 'grading' | 'settings';

// --- Size grading ---

export type GradingUnit = 'cm' | 'in';
export type GradingConstruction = 'flat' | 'circular';
export type GradingMeasurementKind = 'circumference' | 'width' | 'length';

export interface GradingGauge {
  stitches: number;
  rows: number;
  widthCm: number;
  heightCm: number;
}

export interface GradingMeasurementInput {
  id: string;
  name: string;
  kind: GradingMeasurementKind;
  /** One value per size in the request's units; null = not graded for that size. */
  values: (number | null)[];
}

export interface GradingShapingInput {
  id: string;
  name: string;
  fromId: string;
  toId: string;
  overId: string;
  /** Stitches added/removed by one shaping row (e.g. 2 = inc 1 st each end). */
  stitchesPerEvent: number;
}

export interface GradingRequestInput {
  units: GradingUnit;
  construction: GradingConstruction;
  stitchRepeat: number;
  edgeStitches: number;
  ease: number;
  measurementsAre: 'body' | 'finished';
  baseSizeIndex: number;
  sizeNames: string[];
  gauge: GradingGauge;
  measurements: GradingMeasurementInput[];
  shaping: GradingShapingInput[];
}

export interface GradedCell {
  finishedCm: number | null;
  exact: number | null;
  count: number | null;
  achievedCm: number | null;
}

export interface GradedLine {
  measurementId: string;
  name: string;
  kind: GradingMeasurementKind;
  countUnit: 'sts' | 'rows';
  perSize: GradedCell[];
}

export interface GradedShapingCell {
  startCount: number | null;
  endCount: number | null;
  rows: number | null;
  events: number | null;
  plan: string | null;
  ok: boolean;
  problem: string | null;
}

export interface GradedShapingPlan {
  shapingId: string;
  name: string;
  perSize: GradedShapingCell[];
}

export interface GradingWarning {
  severity: 'critical' | 'warning';
  sizeName: string | null;
  title: string;
  detail: string;
  calculation?: string;
}

export interface GradingResult {
  sizeNames: string[];
  baseSizeIndex: number;
  units: GradingUnit;
  construction: GradingConstruction;
  stitchLines: GradedLine[];
  rowLines: GradedLine[];
  shapingPlans: GradedShapingPlan[];
  warnings: GradingWarning[];
  checksRun: number;
}

export interface GradingExplanation {
  summary: string;
  sizeNotes: Array<{ sizeName: string; note: string }>;
  cautions: string[];
}

// --- Tech editing ---

export type TechEditCategory = 'math' | 'clarity' | 'consistency' | 'grammar';
export type TechEditSeverity = 'critical' | 'warning' | 'suggestion';

export interface TechEditFinding {
  category: TechEditCategory;
  severity: TechEditSeverity;
  /** True when the finding was verified by a deterministic calculation on the server. */
  verified: boolean;
  location: string;
  title: string;
  detail: string;
  calculation?: string;
  suggestion?: string;
}

export interface TechEditReport {
  patternTitle: string | null;
  language: string | null;
  summary: string;
  stats: {
    checksRun: number;
    sizesChecked: number;
    findingCounts: Record<TechEditSeverity, number>;
  };
  findings: TechEditFinding[];
}

export interface TechEditRecord {
  id: string;
  timestamp: number;
  fileName: string;
  pages: number;
  cost: number;
}

export type TechEditStage = 'extracting' | 'verifying' | 'reviewing' | 'finalizing';

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
  /** Server pack id (e.g. "credits_10"); used to start checkout. */
  id: string;
  credits: number;
  price: number;
  label: string;
}

export type TranslationJobStatus = 'translating' | 'complete' | 'error';

export interface TranslationJob {
  id: string;
  /** Client timestamp used only for an explicitly estimated progress display. */
  startedAt: number;
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
  /**
   * Server-side pattern row id once the translation has been saved. Lets us
   * persist chat exchanges and unlock paid allowance per pattern.
   */
  serverPatternId: string | null;
}

export interface PendingTranslationStart {
  file: File;
  sourceLanguage: Language;
  targetLanguage: Language;
  pdfMetrics: PdfMetrics | null;
  priceEstimate: PriceEstimate;
}
