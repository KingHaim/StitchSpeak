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
// so finding them in the translated text proves nothing. "continue" is handled
// with French-inflection masking below — it is a real locked term when the
// English infinitive/imperative survives, and ordinary French when conjugated.
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
  // Hyphens that glue letters to digits (pu-068, ab-123, DROPS 234-78) are
  // also token characters so publisher codes are not treated as abbreviations.
  return new RegExp(
    `(?<![\\p{L}\\p{N}])(?<![\\p{L}\\p{N}]-)${escapeRegExp(token)}(?![\\p{L}\\p{N}])(?!-[\\p{L}\\p{N}])`,
    'iu',
  );
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
 * "lace" as a yarn weight or yarn name is not the stitch/fabric "dentelle".
 * Mask those spans so a yardage line like "500 yards of lace weight" does not
 * look like an untranslated lace-stitch term.
 */
function maskNonStitchLace(text: string): string {
  return text
    .replace(/\blace(?:-|\s+)weights?(?:\s+yarns?)?\b/giu, (match) => '\u0001'.repeat(match.length))
    .replace(/\bfil\s+lace\b/giu, (match) => '\u0001'.repeat(match.length))
    .replace(/\b[A-Z][\p{L}'-]+\s+Lace\b/gu, (match) => '\u0001'.repeat(match.length))
    .replace(/\bLace\s+[A-Z][\p{L}'-]+\b/gu, (match) => '\u0001'.repeat(match.length));
}

/**
 * French already uses "continue" / "continuez" as a verb. Mask those so QA
 * only sees leftover English instructions such as "Continue in stockinette".
 */
function maskFrenchContinue(text: string): string {
  return text
    .replace(/\b(?:on|nous|je|tu|il|elle|ils|elles|vous)\s+continue(?:s|z|nt)?\b/giu, (match) => '\u0001'.repeat(match.length))
    .replace(/\bcontinue(?:z|s|nt|ntes)?\b/giu, (match, offset: number) => {
      const token = text.slice(offset, offset + match.length);
      if (/^continue$/i.test(token)) {
        const after = text.slice(offset + match.length);
        if (/^\s+(?:in|until|to|knitting|working|as|from|with|across|for)\b/i.test(after)) {
          return match;
        }
        const before = text.slice(0, offset);
        if (/(?:^|[.!?]\s+)$/.test(before) && /^\s+(?:in|until|to|knitting|working)\b/i.test(after)) {
          return match;
        }
        return '\u0001'.repeat(match.length);
      }
      return '\u0001'.repeat(match.length);
    });
}

function prepareAuditText(text: string, targetCode: string, variant: CheckableVariant): string {
  let prepared = text;
  if (variant.termId === 'lace') prepared = maskNonStitchLace(prepared);
  if (variant.termId === 'cont' && targetCode === 'fr') prepared = maskFrenchContinue(prepared);
  return prepared;
}

function targetFullForm(targetCode: string, termId: string): string | null {
  const term = GLOSSARY_TERMS.find((entry) => entry.id === termId);
  const target = term?.terms[targetCode];
  if (!target?.full.trim()) return null;
  return target.full.split('/')[0].trim();
}

function applyMatchCase(source: string, replacement: string): string {
  if (source.length > 1 && source === source.toLocaleUpperCase()) {
    return replacement.toLocaleUpperCase();
  }
  if (source.charAt(0) === source.charAt(0).toLocaleUpperCase()) {
    return replacement.charAt(0).toLocaleUpperCase() + replacement.slice(1);
  }
  return replacement;
}

const DO_NOT_AUTO_REPAIR_TERM_IDS = new Set([
  'inches',
  'sts',
  'row',
  'rnd',
  'k',
  'p',
  'yo',
  'sl',
  'rep',
  'ea',
  'alt',
]);

function canAutoRepair(variant: CheckableVariant): boolean {
  if (DO_NOT_AUTO_REPAIR_TERM_IDS.has(variant.termId)) return false;
  if (variant.termId === 'cont' || variant.termId === 'lace') return true;
  if (variant.variant.length >= 4) return true;
  if (/\d/.test(variant.variant)) return true;
  return variant.variant.includes(' ');
}

function isSuppressedMatch(text: string, offset: number, match: string, variant: CheckableVariant, targetCode: string): boolean {
  const window = text;
  if (variant.termId === 'lace') {
    const around = `${window.slice(Math.max(0, offset - 20), offset)}${match}${window.slice(offset + match.length, offset + match.length + 24)}`;
    return maskNonStitchLace(around) !== around;
  }
  if (variant.termId === 'cont' && targetCode === 'fr') {
    const around = `${window.slice(Math.max(0, offset - 12), offset)}${match}${window.slice(offset + match.length, offset + match.length + 20)}`;
    return maskFrenchContinue(around) !== around && !/^\s+(?:in|until|to|knitting|working|as|from|with|across|for)\b/i.test(window.slice(offset + match.length));
  }
  return false;
}

function replaceTermsInHtml(
  innerHtml: string,
  variant: CheckableVariant,
  replacement: string,
  targetCode: string,
): string {
  const global = new RegExp(variant.pattern.source, 'giu');
  return innerHtml.replace(/<[^>]+>|[^<]+/g, (part) => {
    if (part.startsWith('<')) return part;
    return part.replace(global, (match, offset: number) => {
      if (isSuppressedMatch(part, offset, match, variant, targetCode)) return match;
      return applyMatchCase(match, replacement);
    });
  });
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
      const preparedSource = prepareAuditText(sourceText, targetCode, variant);
      const preparedTranslated = prepareAuditText(translatedText, targetCode, variant);
      const inSource = variant.pattern.test(preparedSource);
      const inTranslated = variant.pattern.test(preparedTranslated);
      if (inSource && inTranslated) {
        const existing = leaksByTerm.get(variant.termId);
        if (existing) {
          existing.count += 1;
        } else {
          leaksByTerm.set(variant.termId, { variant, count: 1, example: segment });
        }
      }
      sourceText = maskMatches(preparedSource, variant);
      translatedText = maskMatches(preparedTranslated, variant);
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

const ALIGNED_SEGMENT_TAGS = 'h1|h2|h3|h4|h5|h6|p|li|th|td';

function rewriteAlignedInnerHtml(
  html: string,
  rewrite: (innerHtml: string, sourceText: string, translatedText: string) => string | null,
): { html: string; rewriteCount: number } {
  const frames: Array<{
    contentStart: number;
    contentEnd: number;
    innerHtml: string;
    sourceText: string;
    translatedText: string;
  }> = [];
  const openFrames: Array<{
    tagName: string;
    dataO: string | null;
    contentStart: number;
  }> = [];
  const pattern = new RegExp(`<\\/?(${ALIGNED_SEGMENT_TAGS})\\b[^>]*>`, 'gi');
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    const tagName = match[1].toLowerCase();
    if (!match[0].startsWith('</')) {
      const dataO = match[0].match(/\bdata-o\s*=\s*"([^"]*)"/i)?.[1]
        ?? match[0].match(/\bdata-o\s*=\s*'([^']*)'/i)?.[1]
        ?? null;
      openFrames.push({ tagName, dataO, contentStart: pattern.lastIndex });
      continue;
    }
    let frameIndex = -1;
    for (let index = openFrames.length - 1; index >= 0; index -= 1) {
      if (openFrames[index].tagName === tagName) {
        frameIndex = index;
        break;
      }
    }
    if (frameIndex < 0) continue;
    const frame = openFrames[frameIndex];
    openFrames.splice(frameIndex, 1);
    if (frame.dataO === null) continue;
    const innerHtml = html.slice(frame.contentStart, match.index);
    frames.push({
      contentStart: frame.contentStart,
      contentEnd: match.index,
      innerHtml,
      sourceText: frame.dataO
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>'),
      translatedText: innerHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
    });
  }

  let working = html;
  let rewriteCount = 0;
  for (const frame of frames.sort((a, b) => b.contentStart - a.contentStart)) {
    const next = rewrite(frame.innerHtml, frame.sourceText, frame.translatedText);
    if (next === null || next === frame.innerHtml) continue;
    working = `${working.slice(0, frame.contentStart)}${next}${working.slice(frame.contentEnd)}`;
    rewriteCount += 1;
  }
  return { html: working, rewriteCount };
}

/**
 * Deterministic locked-term repair: replace leftover English craft terms with
 * the locked target form inside already-aligned segments, then let the audit
 * report only residual issues. Skips yarn-weight "lace", French continue
 * inflections, and short ambiguous abbreviations such as "in".
 */
export function repairTranslatedGlossary(
  html: string,
  targetLanguage: string,
): { html: string; repairedCount: number } {
  const targetCode = resolveGlossaryLanguage(targetLanguage);
  if (!targetCode || targetCode === 'en') return { html, repairedCount: 0 };

  const variants = checkableVariantsFor(targetCode)
    .filter((variant) => canAutoRepair(variant))
    .sort((a, b) => b.variant.length - a.variant.length);
  if (variants.length === 0) return { html, repairedCount: 0 };

  const replacements = new Map(
    variants.flatMap((variant) => {
      const full = targetFullForm(targetCode, variant.termId);
      return full ? [[variant, full] as const] : [];
    }),
  );

  const rewritten = rewriteAlignedInnerHtml(html, (innerHtml, sourceText, translatedText) => {
    let next = innerHtml;
    let changed = false;
    let workingSource = sourceText;
    let workingTranslated = translatedText;
    for (const variant of variants) {
      const replacement = replacements.get(variant);
      if (!replacement) continue;
      const preparedSource = prepareAuditText(workingSource, targetCode, variant);
      const preparedTranslated = prepareAuditText(workingTranslated, targetCode, variant);
      if (!variant.pattern.test(preparedSource) || !variant.pattern.test(preparedTranslated)) {
        workingSource = maskMatches(preparedSource, variant);
        workingTranslated = maskMatches(preparedTranslated, variant);
        continue;
      }
      const repaired = replaceTermsInHtml(next, variant, replacement, targetCode);
      if (repaired !== next) {
        next = repaired;
        changed = true;
      }
      workingSource = maskMatches(preparedSource, variant);
      workingTranslated = maskMatches(preparedTranslated, variant);
    }
    return changed ? next : null;
  });
  return { html: rewritten.html, repairedCount: rewritten.rewriteCount };
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
