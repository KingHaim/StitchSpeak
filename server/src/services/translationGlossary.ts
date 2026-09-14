import { GLOSSARY_LANGUAGES, GLOSSARY_TERMS } from './glossaryTerms.js';
import { extractAlignedSegments, type AlignedNumberSegment } from './translationNumberAudit.js';
import type { TranslationTopologyWarning } from './translationTopology.js';

/**
 * Locked-glossary enforcement (US2).
 *
 * The StitchSpeak glossary (client source of truth: data/glossary.ts, server
 * copy: glossaryTerms.ts) is the locked terminology bank for every supported
 * language pair. This module:
 *
 *  1. builds a LOCKED TERMINOLOGY BANK prompt section so translate prompts
 *     carry the full en → target term bank (plus the source-language column
 *     when the source is a known glossary language), and
 *  2. audits the translated, data-o-aligned HTML afterwards, emitting
 *     reviewWarnings when English craft terms leak untranslated into a
 *     non-English translation or when a translation into English freestyle-
 *     mixes US and UK variants of the same craft term.
 *
 * The audit deliberately warns instead of hard-failing: unlike number drift
 * (which is provably wrong), terminology matching over natural language has
 * inherent ambiguity, so a human-facing warning with a clear code is the safe
 * enforcement level.
 */

/** Upper bound so a badly translated document cannot flood the UI/API. */
const MAX_GLOSSARY_WARNINGS = 20;

const LANGUAGE_ALIASES: Record<string, string> = {
  dk: 'da',
};

/** Map a language name or ISO code ("Spanish", "es", "dk") to a glossary code. */
export function resolveGlossaryLanguage(language: string): string | null {
  const normalized = language.trim().toLocaleLowerCase();
  if (!normalized) return null;
  const aliased = LANGUAGE_ALIASES[normalized] ?? normalized;
  const match = GLOSSARY_LANGUAGES.find(
    (entry) => entry.code === aliased || entry.name.toLocaleLowerCase() === aliased,
  );
  return match?.code ?? null;
}

function glossaryLanguageName(code: string): string {
  return GLOSSARY_LANGUAGES.find((entry) => entry.code === code)?.name ?? code;
}

/** Lowercase + strip diacritics so "raglán" matches "raglan". */
function foldToken(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Expand a glossary form into its concrete variants:
 * "bind off / cast off" → both; "st(s)" → "st" + "sts"; "stitch(es)" →
 * "stitch" + "stitches".
 */
function expandForms(value: string): string[] {
  return value
    .split('/')
    .map((form) => form.trim())
    .filter(Boolean)
    .flatMap((form) => {
      const optionalSuffix = form.match(/^(.+?)\((\p{L}+)\)$/u);
      if (optionalSuffix) {
        const base = optionalSuffix[1].trim();
        return [base, `${optionalSuffix[1]}${optionalSuffix[2]}`.trim()];
      }
      return [form];
    });
}

function formatTermForPrompt(entry: { abbreviation: string; full: string }): string {
  const abbreviation = entry.abbreviation.trim();
  const full = entry.full.trim();
  if (!abbreviation || foldToken(abbreviation) === foldToken(full)) return full;
  return `${full} [${abbreviation}]`;
}

const ENGLISH_VARIANT_CONSISTENCY_RULES = `### LOCKED ENGLISH TERMINOLOGY (STITCHSPEAK GLOSSARY):
- Use standard English knitting/crochet terminology and abbreviations consistently across prose, tables, glossary, and chart legends.
- Choose ONE regional variant family (US or UK) for the whole pattern and keep it. Never mix "bind off" with "cast off", "gauge" with "tension", "stockinette" with "stocking stitch", or "yarn over" with "yarn forward" inside the same translation.`;

/**
 * Build the LOCKED TERMINOLOGY BANK prompt section for a target language.
 * When the source language is also a known glossary language (and differs from
 * both English and the target), its column is included so the bank covers the
 * actual language pair being translated.
 */
export function buildGlossaryPromptSection(
  targetLanguage: string,
  sourceLanguage?: string,
): string {
  const targetCode = resolveGlossaryLanguage(targetLanguage);
  if (!targetCode) return '';
  if (targetCode === 'en') return ENGLISH_VARIANT_CONSISTENCY_RULES;

  const sourceCode = sourceLanguage ? resolveGlossaryLanguage(sourceLanguage) : null;
  const extraSourceCode = sourceCode && sourceCode !== 'en' && sourceCode !== targetCode
    ? sourceCode
    : null;
  const targetName = glossaryLanguageName(targetCode);

  const lines = GLOSSARY_TERMS.flatMap((term) => {
    const english = term.terms.en;
    const target = term.terms[targetCode];
    if (!english || !target) return [];
    const sourceSide = [formatTermForPrompt(english)];
    if (extraSourceCode) {
      const source = term.terms[extraSourceCode];
      if (source) sourceSide.push(formatTermForPrompt(source));
    }
    return [`- ${sourceSide.join(' / ')} -> ${formatTermForPrompt(target)}`];
  });
  if (lines.length === 0) return '';

  return `### LOCKED TERMINOLOGY BANK — ${targetName.toUpperCase()} (STITCHSPEAK GLOSSARY):
Every mapping below is LOCKED end-to-end. When the source uses one of these craft terms (full form or abbreviation), you MUST use the locked ${targetName} equivalent — the abbreviation in instructions and chart legends, the full term in explanatory prose and glossary definitions. Apply each mapping consistently across prose, tables, glossary, and chart legends. Never invent a freestyle translation for a locked term, never mix regional variants, and never leave the source-language form where a locked equivalent exists. If a STRICT language-specific rule above gives a more specific mapping for the same term, that rule wins.
${lines.join('\n')}`;
}

// English glossary forms that are legitimately preserved untranslated in
// reviewed translations (yarn-weight names and proper nouns), so their
// presence in the target text is never leakage.
const GLOBALLY_PRESERVED_ENGLISH_FORMS = new Set([
  'dk',
  'dk weight',
  'fingering',
  'fingering weight',
  'worsted',
  'worsted weight',
  'light worsted',
  'bulky',
  'chunky',
  'fair isle',
  'i-cord',
  'kitchener stitch',
]);

// English glossary tokens that are also everyday words in a target language,
// so finding them in the translated text proves nothing.
const AMBIGUOUS_NATURAL_WORDS: Record<string, readonly string[]> = {
  es: ['yo'],
  fr: ['pu', 'tension'],
  da: ['tog', 'alt', 'hank', 'rem', 'bo'],
  no: ['tog', 'alt', 'hank', 'rem', 'bo'],
  sv: ['tog', 'alt', 'hem', 'rem', 'bo'],
  nl: ['hem'],
  de: ['alt'],
};

interface CheckableVariant {
  termId: string;
  /** The concrete English form to look for, e.g. "yarn over" or "k2tog". */
  variant: string;
  pattern: RegExp;
  /** Human-readable locked target equivalent for the warning message. */
  lockedEquivalent: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tokenPattern(token: string): RegExp {
  // Custom boundaries: letters/digits on either side keep "sl" from matching
  // inside "sleeve" while still matching tokens like "k2tog", "w&t", "i-cord".
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(token)}(?![\\p{L}\\p{N}])`, 'iu');
}

/**
 * Every word and expanded form of a language's locked terms, accent-folded.
 * Used to skip English tokens that coincide with locked target terminology
 * (Danish "pm" stays "pm"; Korean keeps "(SSK)" inside its locked full term).
 */
function lockedTargetTokens(targetCode: string): Set<string> {
  const tokens = new Set<string>();
  for (const term of GLOSSARY_TERMS) {
    const target = term.terms[targetCode];
    if (!target) continue;
    for (const value of [target.abbreviation, target.full]) {
      for (const form of expandForms(value)) {
        const folded = foldToken(form);
        if (folded) tokens.add(folded);
        for (const word of folded.split(/[\s/()]+/)) {
          if (word) tokens.add(word);
        }
      }
    }
  }
  return tokens;
}

function checkableVariantsFor(targetCode: string): CheckableVariant[] {
  const targetTokens = lockedTargetTokens(targetCode);
  const ambiguous = new Set(AMBIGUOUS_NATURAL_WORDS[targetCode] ?? []);
  const variants: CheckableVariant[] = [];
  const seen = new Set<string>();

  for (const term of GLOSSARY_TERMS) {
    const english = term.terms.en;
    const target = term.terms[targetCode];
    if (!english || !target) continue;
    const lockedEquivalent = target.abbreviation && target.abbreviation !== target.full
      ? `${target.full} [${target.abbreviation}]`
      : target.full;

    for (const value of [english.abbreviation, english.full]) {
      for (const form of expandForms(value)) {
        const folded = foldToken(form);
        if (folded.length < 2) continue;
        if (seen.has(folded)) continue;
        if (GLOBALLY_PRESERVED_ENGLISH_FORMS.has(folded)) continue;
        if (ambiguous.has(folded)) continue;
        if (targetTokens.has(folded)) continue;
        seen.add(folded);
        variants.push({
          termId: term.id,
          variant: form,
          pattern: tokenPattern(form),
          lockedEquivalent,
        });
      }
    }
  }
  return variants;
}

function excerpt(text: string): string {
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

function maskMatches(text: string, variant: CheckableVariant): string {
  const global = new RegExp(variant.pattern.source, 'giu');
  return text.replace(global, (match) => '\u0001'.repeat(match.length));
}

/**
 * Warn when English craft terms that have a locked target equivalent appear in
 * the source segment AND survive verbatim into its translation.
 */
function auditEnglishTermLeakage(
  segments: AlignedNumberSegment[],
  targetCode: string,
): TranslationTopologyWarning[] {
  // Longest variants first so a leaked "yarn over" doesn't also count as a
  // leaked "yarn": each matched variant is masked out before shorter ones run.
  const variants = checkableVariantsFor(targetCode)
    .sort((a, b) => b.variant.length - a.variant.length);
  if (variants.length === 0) return [];
  const targetName = glossaryLanguageName(targetCode);

  interface Leak {
    variant: CheckableVariant;
    count: number;
    example: AlignedNumberSegment;
  }
  const leaksByTerm = new Map<string, Leak>();

  for (const segment of segments) {
    if (!segment.sourceText || !segment.translatedText) continue;
    let sourceText = segment.sourceText;
    let translatedText = segment.translatedText;
    for (const variant of variants) {
      const inSource = variant.pattern.test(sourceText);
      const inTranslated = variant.pattern.test(translatedText);
      if (inSource && inTranslated) {
        const existing = leaksByTerm.get(variant.termId);
        if (existing) {
          existing.count += 1;
        } else {
          leaksByTerm.set(variant.termId, { variant, count: 1, example: segment });
        }
      }
      if (inSource) sourceText = maskMatches(sourceText, variant);
      if (inTranslated) translatedText = maskMatches(translatedText, variant);
    }
  }

  return [...leaksByTerm.values()].map(({ variant, count, example }) => ({
    code: 'GLOSSARY_TERM_UNTRANSLATED' as const,
    ...(example.sourceId ? { sourceId: example.sourceId } : {}),
    message: `The English craft term "${variant.variant}" still appears in ${count} translated segment${count === 1 ? '' : 's'} (e.g. source "${excerpt(example.sourceText)}") instead of the locked ${targetName} equivalent "${variant.lockedEquivalent}".`,
  }));
}

/** US/UK variant families that must never be freestyle-mixed in English output. */
const ENGLISH_VARIANT_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['bind off', 'cast off'],
  ['gauge', 'tension'],
  ['stockinette', 'stocking stitch'],
  ['yarn over', 'yarn forward'],
];

// "tension" preceded by these words is yarn-handling prose ("keep an even
// tension"), not the UK equivalent of "gauge".
const TENSION_PROSE_QUALIFIERS = new Set(['even', 'yarn', 'loose', 'looser', 'tight', 'tighter', 'consistent']);

function englishVariantPresent(text: string, variant: string): boolean {
  if (variant !== 'tension') return tokenPattern(variant).test(text);
  const matches = text.matchAll(/(?<![\p{L}\p{N}])tension(?![\p{L}\p{N}])/giu);
  for (const match of matches) {
    const precedingWord = text
      .slice(0, match.index)
      .match(/(\p{L}+)\s*$/u)?.[1]
      ?.toLocaleLowerCase();
    if (!precedingWord || !TENSION_PROSE_QUALIFIERS.has(precedingWord)) return true;
  }
  return false;
}

/** Warn when a translation into English mixes US and UK forms of one term. */
function auditEnglishVariantMix(
  segments: AlignedNumberSegment[],
): TranslationTopologyWarning[] {
  const translatedText = segments.map((segment) => segment.translatedText).join('\n');
  if (!translatedText.trim()) return [];

  return ENGLISH_VARIANT_PAIRS.flatMap(([usForm, ukForm]) => {
    if (!englishVariantPresent(translatedText, usForm)) return [];
    if (!englishVariantPresent(translatedText, ukForm)) return [];
    return [{
      code: 'GLOSSARY_VARIANT_MIX' as const,
      message: `The English translation mixes "${usForm}" and "${ukForm}" — pick one regional variant family (US or UK) and use it consistently.`,
    }];
  });
}

/**
 * Deterministic post-translation glossary audit over the data-o-aligned
 * segments. Returns warn-level reviewWarnings; it never mutates the HTML and
 * never hard-fails (terminology matching over natural language is not exact
 * enough to justify blocking delivery the way unrestorable number drift does).
 */
export function auditTranslatedGlossary(
  html: string,
  targetLanguage: string,
): TranslationTopologyWarning[] {
  const targetCode = resolveGlossaryLanguage(targetLanguage);
  if (!targetCode) return [];

  const segments = extractAlignedSegments(html);
  if (segments.length === 0) return [];

  const warnings = targetCode === 'en'
    ? auditEnglishVariantMix(segments)
    : auditEnglishTermLeakage(segments, targetCode);

  if (warnings.length > MAX_GLOSSARY_WARNINGS) {
    const extra = warnings.length - MAX_GLOSSARY_WARNINGS;
    return [
      ...warnings.slice(0, MAX_GLOSSARY_WARNINGS),
      {
        code: 'GLOSSARY_TERM_UNTRANSLATED',
        message: `${extra} more locked glossary term${extra === 1 ? '' : 's'} may not have been applied; review terminology throughout.`,
      },
    ];
  }
  return warnings;
}
