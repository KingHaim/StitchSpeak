
import type { Language } from './types';

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

export const PRICING = {
  translation: {
    inputCostPer1MTokens: 1.25,
    outputCostPer1MTokens: 5.00,
    margin: 4,
    minimumPrice: 0.25,
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
