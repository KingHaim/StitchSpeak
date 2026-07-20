
import type { Language, CreditPackage } from './types';

export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English' },
  { code: 'de', name: 'German' },
  { code: 'fr', name: 'French' },
  { code: 'es', name: 'Spanish' },
  { code: 'it', name: 'Italian' },
  { code: 'nl', name: 'Dutch' },
  { code: 'sv', name: 'Swedish' },
  { code: 'no', name: 'Norwegian' },
  { code: 'da', name: 'Danish' },
  { code: 'fi', name: 'Finnish' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'ru', name: 'Russian' },
];

export const AUTO_DETECT_LANGUAGE: Language = { code: 'auto', name: 'Auto-Detect' };

export const SOURCE_LANGUAGES: Language[] = [
  AUTO_DETECT_LANGUAGE,
  ...LANGUAGES,
];

// Display catalogue mirroring the server's source of truth (server/src/services/pricing.ts).
// `id` must match the server pack ids so checkout charges the right amount.
export const CREDIT_PACKAGES: CreditPackage[] = [
  { id: 'credits_7', credits: 7, price: 7.00, label: '7 credits' },
  { id: 'credits_10', credits: 10, price: 8.50, label: '10 credits' },
  { id: 'credits_25', credits: 25, price: 19.00, label: '25 credits' },
  { id: 'credits_50', credits: 50, price: 35.00, label: '50 credits' },
];

/** Landing pricing → sign in: `DashboardPage` opens Buy Credits for this package index. Cleared when that modal closes. */
export const PENDING_BUY_CREDITS_PACK_INDEX_KEY = 'ss_pending_buy_credits_pack_idx';

export const PRICING = {
  translation: {
    inputCostPer1MTokens: 2.00,
    outputCostPer1MTokens: 12.00,
    fixedMargin: 6.00,
    includedPages: 10,
    pageSurcharge: 1.00,
    pagesPerSurchargeStep: 5,
  },
  chat: {
    packageSize: 20,
    packagePrice: 0.10,
    freeMessages: 3,
  },
  techEdit: {
    inputCostPer1MTokens: 2.00,
    outputCostPer1MTokens: 12.00,
    passes: 2,
    fixedMargin: 9.00,
    includedPages: 10,
    pageSurcharge: 1.50,
    pagesPerSurchargeStep: 5,
    maxPages: 30,
  },
  tokenEstimation: {
    charsPerToken: 4,
    systemPromptTokens: 500,
    outputMultiplier: 1.2,
  },
};
