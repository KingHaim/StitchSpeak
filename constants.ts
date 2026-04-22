
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
];

export const AUTO_DETECT_LANGUAGE: Language = { code: 'auto', name: 'Auto-Detect' };

export const SOURCE_LANGUAGES: Language[] = [
  AUTO_DETECT_LANGUAGE,
  ...LANGUAGES,
];

export const CREDIT_PACKAGES: CreditPackage[] = [
  { credits: 5, price: 5.00, label: '5 credits' },
  { credits: 10, price: 8.50, label: '10 credits' },
  { credits: 25, price: 19.00, label: '25 credits' },
  { credits: 50, price: 35.00, label: '50 credits' },
];

/** Landing pricing → sign in: `DashboardPage` opens Buy Credits for this package index. Cleared when that modal closes. */
export const PENDING_BUY_CREDITS_PACK_INDEX_KEY = 'ss_pending_buy_credits_pack_idx';

export const PRICING = {
  translation: {
    inputCostPer1MTokens: 1.25,
    outputCostPer1MTokens: 5.00,
    fixedMargin: 6.00,
  },
  chat: {
    packageSize: 20,
    packagePrice: 0.10,
    freeMessages: 3,
  },
  tokenEstimation: {
    charsPerToken: 4,
    systemPromptTokens: 500,
    outputMultiplier: 1.2,
  },
};
