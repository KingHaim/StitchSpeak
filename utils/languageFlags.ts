import { LANGUAGES } from '../constants';

const CODE_TO_FLAG: Record<string, string> = {
  en: '🇬🇧',
  de: '🇩🇪',
  fr: '🇫🇷',
  es: '🇪🇸',
  it: '🇮🇹',
  nl: '🇳🇱',
  sv: '🇸🇪',
  no: '🇳🇴',
  da: '🇩🇰',
  fi: '🇫🇮',
  pt: '🇵🇹',
  ja: '🇯🇵',
  ko: '🇰🇷',
  ru: '🇷🇺',
};

const nameToCode = new Map(LANGUAGES.map((l) => [l.name.toLowerCase(), l.code]));
const nameOrder = new Map(LANGUAGES.map((l, i) => [l.name, i]));

export function languageFlagEmoji(languageLabel: string): string {
  const code = nameToCode.get(languageLabel.toLowerCase());
  if (code && CODE_TO_FLAG[code]) return CODE_TO_FLAG[code];
  return '🌐';
}

export function sortedUniqueLanguageLabels(labels: Iterable<string>): string[] {
  const unique = [...new Set(labels)];
  return unique.sort((a, b) => (nameOrder.get(a) ?? 999) - (nameOrder.get(b) ?? 999));
}
