import { GoogleGenAI, ThinkingLevel, Type, type Chat } from '@google/genai';
import crypto from 'node:crypto';
import { extractImages, buildImageCatalog, replaceImageMarkers } from './pdfImages.js';
import { extractTypographyHints, buildTypographyCatalog } from './pdfTypography.js';
import {
  buildPdfPageArtifactInstruction,
  detectPdfPageArtifacts,
  removePdfPageArtifacts,
} from './pdfPageArtifacts.js';
import { detectSourceKind, extractDocumentHtml } from './documentExtract.js';
import { isProviderBillingExhausted, withExternalDeadline } from './externalDeadline.js';
import {
  annotateSourceTopology,
  auditTranslatedTopology,
  type TranslationTopologyWarning,
} from './translationTopology.js';
import {
  findMarkdownArtifacts,
  normalizeSpanishMeasurementsInHtml,
  sanitizeMarkdownArtifactsInHtml,
} from './translationSanitizers.js';

let aiClient: GoogleGenAI | null = null;

export function getAI(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey?.trim()) {
      throw new Error('GEMINI_API_KEY environment variable is not set.');
    }
    aiClient = new GoogleGenAI({ apiKey: apiKey.trim() });
  }
  return aiClient;
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const RETRYABLE_UNDICI_CODES = new Set([
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
  'ECONNRESET',
  'ETIMEDOUT',
  'EAI_AGAIN',
]);
const MAX_RETRIES = 2;
const BASE_DELAY_MS = 1000;
const TRANSLATION_DEADLINE_MS = 4 * 60 * 1000;
const CHAT_DEADLINE_MS = 45 * 1000;
const GLOSSARY_DEADLINE_MS = 20 * 1000;

function isRetryableError(err: any): boolean {
  // Retrying cannot replenish the provider account and only delays the same
  // deterministic failure while consuming request capacity.
  if (isProviderBillingExhausted(err)) return false;
  for (let current: any = err; current; current = current.cause) {
    if (current?.name === 'AbortError' || current?.name === 'TimeoutError') return false;
  }
  const status = err?.status ?? err?.httpStatusCode;
  if (RETRYABLE_STATUS.has(Number(status))) return true;

  // Walk the error chain to inspect the underlying undici cause (TypeError: fetch failed
  // wraps a HeadersTimeoutError / BodyTimeoutError / etc. via `cause`).
  for (let current: any = err; current; current = current.cause) {
    const code = current?.code;
    if (typeof code === 'string' && RETRYABLE_UNDICI_CODES.has(code)) return true;
  }

  const msg = String(err?.message ?? '');
  return (
    msg.includes('429') ||
    msg.includes('503') ||
    msg.includes('overloaded') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('fetch failed') ||
    msg.includes('Headers Timeout') ||
    msg.includes('Body Timeout')
  );
}

export async function withRetry<T>(fn: () => T | Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      if (!isRetryableError(err) || attempt === MAX_RETRIES) throw err;

      const status = err?.status ?? err?.httpStatusCode ?? err?.code ?? err?.cause?.code;
      const msg = String(err?.message ?? '');
      const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 500;
      console.log(
        `[gemini] Retrying after ${Math.round(delay)}ms (attempt ${attempt + 1}/${MAX_RETRIES}, ${status || msg.slice(0, 80)})`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

// Centralized model id so the translation pipeline (PDF + document paths) stays
// in sync when Gemini model names change.
const TRANSLATION_MODEL = 'gemini-3.1-pro-preview';
const TITLE_REPAIR_MODEL = 'gemini-3.5-flash';

// gemini-3.1-pro-preview is a "thinking" model. Left at its default thinking
// level it can spend 30-80s "reasoning" before emitting a single token, and the
// total generation for a real pattern easily exceeds the edge/proxy response
// timeout (Cloudflare/Railway), which kills the NDJSON stream mid-flight and
// surfaces to the user as "The connection to the server was interrupted while
// streaming the translation". Translation is a deterministic transformation, not
// a reasoning task, so LOW thinking gives equivalent fidelity at roughly half the
// latency and reliably lands inside the timeout window.
const TRANSLATION_THINKING_CONFIG = { thinkingLevel: ThinkingLevel.LOW } as const;

function getLanguageSpecificRules(language: string): string {
  const normalized = language.toLowerCase();
  if (normalized === 'spanish') {
    return `
    ### STRICT TERMINOLOGY MAPPINGS FOR SPANISH:
    - Cast On (CO) -> MO (Montar puntos)
    - Bind Off (BO) -> Rem (Rematar puntos)
    - Place Marker (PM) -> pm (poner marcador)
    - purl front and back (pfb) -> Rft (reves por el frente y por detras)
    - slip (sl) -> desl (deslizar) — NEVER use "des"
    - slip slip knit (SSK / ssk) -> ddD (deslizar, deslizar, derecho)
    - knit 2 together (k2tog) -> 2pjD (2 puntos juntos derecho)
    - yarn over (yo / "yarn over") -> H (hebra / lazada)
    - knit (K / "knit") -> D (derecho) — NEVER leave the English word "knit"
    - centered double decrease (CDD / s2kp / sk2p) -> DDC (disminución doble centrada)
    - Sweater -> Jersey (NEVER use "suéter" or "sweater")
    - LH needle -> Ag-i (Aguja izquierda)
    - RH needle -> Ag-d (Aguja derecha)
    - held double -> tejido/tejer con dos hebras juntas (NEVER "tejido doble")
    - sleeve -> manga; armhole -> sisa; in a vest, source "right sleeve" can refer to the sisa derecha when the instruction concerns armhole edging, not an actual manga derecha
    - ribbing -> elástico
    - bind off -> rematar; Italian bind-off / tubular bind-off -> remate italiano, adding "en circular" when worked in the round (NEVER generic "cierre tubular")
    - decrease / stitches reduced -> disminución / puntos disminuidos (NEVER "puntos reducidos")
    - pick up and knit -> recoger y tejer
    - stockinette stitch -> punto jersey
    - cable needle -> aguja auxiliar
    - waste yarn -> hebra auxiliar
    - locking marker -> marcador con cierre / marcador con cierre extraíble
    - right side / wrong side -> lado derecho / lado revés; abbreviations LD / LR
    - RS facing -> con el LD de la labor hacia ti
    - work chart accordingly -> trabaja el gráfico según corresponda
    - blocking -> bloqueo; pre-blocking -> bloqueo intermedio
    - In sections worked flat, row/rows -> fila/filas. Reserve round/rounds -> vuelta/vueltas exclusively for work in the round. Never translate both as vuelta.
    - BOR -> CV (comienzo de vuelta) everywhere, including instructions, glossary, and chart labels
    - slip marker (sm) -> dm; place marker (pm) -> pm. Never merge, swap, or conflate dm and pm.
    - Approved Spanish knitting abbreviations include LD, LR, CV, pts, A1D, A1I, 2pjD, dm, and pm; use them consistently in prose, glossary, and charts.
    - larger/smaller needles -> agujas de mayor grosor / agujas de menor grosor (NEVER "agujas más grandes/pequeñas")
    - "as indicated above" -> como se indica arriba, using present-tense instructional wording
    - "the short tail of the yarn" -> el cabo suelto del hilo (NEVER "un trozo de la misma lana")
    - Replace vague "trabaja el gráfico como se ha establecido" with the specific chart name and size from the source.
    - Spanish measurements use decimal commas, a space before units (170 m, 50 g, 10 cm, 2 pts), and en dashes for ranges (8–10 cm, 1–3 meses). Keep the source values, unit system, and number of sizes unchanged.
    - Preserve the intentional yarn-weight terms "fingering", "DK", and "light worsted" consistently.

    ### CHART-LEGEND EXAMPLES (Spanish) — never leave these English forms:
    - k2tog -> 2pjD (2 puntos juntos derecho)
    - ssk -> ddD (deslizar, deslizar, derecho)
    - CDD -> DDC (disminución doble centrada)
    - knit -> D (derecho)
    - yarn over -> H (hebra / lazada)
    `;
  }
  if (normalized === 'danish' || normalized === 'da' || normalized === 'dk') {
    return `
    ### STRICT TERMINOLOGY AND QA RULES FOR DANISH (NATIVE-REVIEWED; OVERRIDE GENERAL RULES):
    - toddler -> småbørn
    - garment, when it refers to this sweater -> trøje / trøjen according to Danish grammar; never use the generic tøj for the sweater itself
    - positive ease -> bevægelsesrum
    - put stitches on hold -> sæt maskerne til hvile
    - remain on hold -> maskerne hviler fortsat
    - sweater version -> Sweater-versionen
    - charted cable instructions -> snoningsdiagrammer
    - skein -> nøgle / nøglen with correct Danish inflection for the sentence
    - pm -> preserve the token pm exactly; glossary definition: Placer markør
    - sm (slip marker) -> fm; glossary definition: Flyt markør. Never turn pm into fm or sm, and never turn sm into pm.
    - right side -> retsiden; wrong side -> vrangsiden

    ### DANISH STYLE AND VALIDATION:
    - Protect knitting abbreviations as whole tokens. Never merge adjacent tokens, and never infer that pm and sm are interchangeable.
    - Preserve cm, in, every size range, stitch count, row number, and chart reference exactly.
    - Do not inject English explanations or translator notes into the finished translation.
    - Prefer direct Danish knitting instructions: "Begynd at strikke…", never the indirect "Du vil begynde at strikke…".
    - Prefer concise active constructions, for example: "forstykket strikkes nu videre efter kropsdiagrammet."
    - Apply Danish compound and heading conventions consistently, including "Sweater-versionen" and "Samling af forstykke".
    - Reject merged or overlapping fragments such as pmsm and tilpå, repeated nouns, doubled headings, or old and new text appearing together.
    - Use consistent terminology across the construction summary, shoulders, neckline, sleeves, glossary, and chart legend.
    - Remove mixed-language parentheticals and editing instructions.
    - Validate natural Danish punctuation after translation; do not mechanically retain English comma patterns except where punctuation encodes size grouping.
    `;
  }
  if (normalized === 'french' || normalized === 'fr') {
    return `
    ### STRICT TERMINOLOGY AND FLUENCY RULES FOR FRENCH (HUMAN-REVIEWED):
    - l’ourlet -> la bordure in the reviewed knitting context
    - In explanatory prose, write maille in full, not the abbreviation m.
    - When knitting in the round, source round means tour, never point.
    - pièce -> ouvrage or partie du corps according to context.
    - aiguille à tapisserie -> aiguille à laine
    - bord de montage -> rang de montage
    - Passer aux aiguilles… -> Prendre les aiguilles…
    - prébloquez -> pré-bloquez
    - code QR -> QR code
    - Prefer natural French: verrez -> trouverez; utilise -> possède; établi -> indiqué; organisées -> regroupées; remesurer -> mesurer à nouveau.
    - Restore complete wording and required articles, nouns, and connectors such as la, les mailles, de la grille, tout, ensuite, and précédemment when required by the complete sentence.
    - Check articles and agreement carefully; use le bon échantillon.
    - Avoid redundant pairs such as désormais… maintenant and repeated consecutive wording such as "en utilisant le petit bout du fil".
    - Detect duplicated glossary definitions, including repeated GGT definitions.
    - Keep terminology identical across prose, abbreviations, glossary, and chart legend.
    - Make cross-references natural in the complete sentence: choose partie/section and dans/pour/du/pour le from sentence context, never isolated word substitution.
    - Preserve meaningful source emphasis and keep it attached to the equivalent translated phrase, including "en utilisant le petit bout du fil" when emphasized.
    - Review complete instructional sentences, prefer idiomatic French over English calques, and do not leave untranslated English notes.
    `;
  }
  if (normalized === 'korean') {
    return `
    ### STRICT TERMINOLOGY MAPPINGS FOR KOREAN:
    - Use standard Korean knitting terminology and Hangul abbreviations throughout.
    - Cast On (CO) -> 코잡기
    - Bind Off / Cast Off (BO) -> 코막음
    - knit (K) -> 겉뜨기 (겉)
    - purl (P) -> 안뜨기 (안)
    - yarn over (YO) -> 바늘비우기
    - knit 2 together (k2tog) -> 2코 함께 겉뜨기
    - slip slip knit (SSK) -> 2코 슬립 후 함께 겉뜨기 (SSK)
    - slip (sl) -> 걸러뜨기
    - Place Marker (PM) -> 마커 놓기
    - stitch(es) -> 코
    - row -> 단
    - round -> 라운드 / 단
    - Right Side (RS) -> 겉면
    - Wrong Side (WS) -> 안면
    - Keep size numbers, measurements, and chart symbols intact; translate surrounding instructional text into natural Korean.
    `;
  }
  return '';
}

const createSizeFormatPreservationRules = (sectionNumber: number) => `
### ${sectionNumber}. SIZE FORMAT PRESERVATION (CRITICAL):
- Multi-size instructions must preserve the source pattern's exact size structure across the whole translated pattern.
- Keep the same punctuation and grouping used by the source for each size list: parentheses, brackets, commas, slashes, spacing, and the position of every bold/plain size marker.
- Never convert one sizing convention into another. For example, if the source has "18 (20, 23, 25, 27, 30)", keep that structure; if the source alternates "<strong>18</strong> (20, <strong>23</strong>, 25, <strong>27</strong>, 30)", keep those same bold slots and parentheses.
- Apply the source's size-format convention consistently everywhere the same size sequence appears. Do not invent a global alternating rule and do not normalize all later sizes into parentheses unless the source does that.
`;

const createTitleTranslationRules = (sectionNumber: number, language: string) => `
### ${sectionNumber}. TITLE & COVER TEXT (CRITICAL):
- Translate every human-language word in the pattern title, subtitle, and other cover headings into ${language}. Cover text is part of the pattern and MUST NOT remain in the source language.
- Preserve only genuine proper names, designer/brand names, usernames, and product codes. In a mixed title such as "Lazos Sweater & Vest", preserve only "Lazos" and translate "Sweater & Vest" into ${language}.
- Descriptive words are not protected names: garment types, age groups, audience labels, and conjunctions must be translated. For example, "Baby & Toddler" must be translated into ${language}.
- This applies throughout the pattern, not only on the cover. Descriptive body labels such as "Sweater version:" and "Vest version:" must also be translated into ${language}; they are not product names.
- Keep the original title hierarchy, styling, and line breaks while translating its wording.
`;

export interface CoverHeadingForVerification {
  id: string;
  originalText: string;
  currentText: string;
}

interface CoverHeadingMatch extends CoverHeadingForVerification {
  contentStart: number;
  contentEnd: number;
  hasOriginalText: boolean;
}

function decodeHtmlText(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function findCoverHeadingMatches(html: string): CoverHeadingMatch[] {
  const headingPattern = /<(h[1-4])\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
  const allMatches: Array<CoverHeadingMatch & { tagName: string; start: number; end: number }> = [];
  let match: RegExpExecArray | null;

  while ((match = headingPattern.exec(html)) !== null) {
    const full = match[0];
    const attributes = match[2];
    const innerHtml = match[3];
    const openingTagEnd = full.indexOf('>') + 1;
    const closingTagStart = full.toLowerCase().lastIndexOf(`</${match[1].toLowerCase()}`);
    const dataOriginal = attributes.match(/\bdata-o\s*=\s*"([\s\S]*?)"/i)
      ?? attributes.match(/\bdata-o\s*=\s*'([\s\S]*?)'/i);

    allMatches.push({
      id: `cover-${allMatches.length + 1}`,
      tagName: match[1].toLowerCase(),
      start: match.index,
      end: match.index + full.length,
      contentStart: match.index + openingTagEnd,
      contentEnd: match.index + closingTagStart,
      originalText: decodeHtmlText(dataOriginal?.[1] ?? innerHtml),
      currentText: decodeHtmlText(innerHtml),
      hasOriginalText: Boolean(dataOriginal?.[1]),
    });
  }

  const titleIndex = allMatches.findIndex((heading) => heading.tagName === 'h1');
  if (titleIndex < 0) return [];

  const coverMatches = [allMatches[titleIndex]];
  for (let index = titleIndex + 1; index < allMatches.length && coverMatches.length < 3; index++) {
    const previous = allMatches[index - 1];
    const candidate = allMatches[index];
    const between = html.slice(previous.end, candidate.start);
    // A paragraph/list/table marks the beginning of the actual pattern body.
    // Adjacent headings before it are title/subtitle lines from the cover.
    if (/<(?:p|li|ul|ol|table)\b/i.test(between) || decodeHtmlText(between)) break;
    coverMatches.push(candidate);
  }

  return coverMatches;
}

export function extractCoverHeadingsForVerification(html: string): CoverHeadingForVerification[] {
  return findCoverHeadingMatches(html).map(({ id, originalText, currentText }) => ({
    id,
    originalText,
    currentText,
  }));
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function applyCoverHeadingTranslations(
  html: string,
  translations: Array<{ id: string; text: string }>,
): string {
  const translatedById = new Map(
    translations
      .filter((item) => item && typeof item.id === 'string' && typeof item.text === 'string')
      .map((item) => [item.id, item.text.trim().slice(0, 500)]),
  );

  let repaired = html;
  for (const heading of findCoverHeadingMatches(html).reverse()) {
    const translated = translatedById.get(heading.id);
    if (!translated) continue;
    repaired = `${repaired.slice(0, heading.contentStart)}${escapeHtmlText(translated)}${repaired.slice(heading.contentEnd)}`;
  }
  return repaired;
}

function normalizedWords(value: string): string[] {
  return value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

export interface BodyBlockForVerification {
  id: string;
  originalText: string;
  currentText: string;
}

interface BodyBlockMatch extends BodyBlockForVerification {
  contentStart: number;
  contentEnd: number;
  innerHtml: string;
}

function normalizedLetterWords(value: string): string[] {
  return value.toLocaleLowerCase().match(/[\p{L}]+/gu) ?? [];
}

function findUntranslatedBlockMatches(html: string): BodyBlockMatch[] {
  const blockPattern = /<(h[2-4]|p|li)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
  const matches: BodyBlockMatch[] = [];
  let match: RegExpExecArray | null;

  while ((match = blockPattern.exec(html)) !== null) {
    const full = match[0];
    const attributes = match[2];
    const innerHtml = match[3];
    const dataOriginal = attributes.match(/\bdata-o\s*=\s*"([\s\S]*?)"/i)
      ?? attributes.match(/\bdata-o\s*=\s*'([\s\S]*?)'/i);
    if (!dataOriginal?.[1] || /\[\s*(?:IMG|ROW)[_\s-]?\d+\s*\]/i.test(innerHtml)) continue;

    const originalText = decodeHtmlText(dataOriginal[1]);
    const currentText = decodeHtmlText(innerHtml);
    const originalWords = normalizedLetterWords(originalText);
    const currentWords = normalizedLetterWords(currentText);
    if (originalWords.length === 0 || originalWords.join(' ') !== currentWords.join(' ')) continue;
    if (originalText.length > 500 || currentText.length > 500) continue;

    const openingTagEnd = full.indexOf('>') + 1;
    const closingTagStart = full.toLowerCase().lastIndexOf(`</${match[1].toLowerCase()}`);
    matches.push({
      id: `body-${matches.length + 1}`,
      originalText,
      currentText,
      contentStart: match.index + openingTagEnd,
      contentEnd: match.index + closingTagStart,
      innerHtml,
    });
  }

  return matches;
}

export function extractUntranslatedBlocksForVerification(html: string): BodyBlockForVerification[] {
  return findUntranslatedBlockMatches(html).map(({ id, originalText, currentText }) => ({
    id,
    originalText,
    currentText,
  }));
}

function translatedInnerHtml(originalInnerHtml: string, translatedText: string): string {
  const escaped = escapeHtmlText(translatedText);
  const leading = originalInnerHtml.match(/^\s*/)?.[0] ?? '';
  const trailing = originalInnerHtml.match(/\s*$/)?.[0] ?? '';
  const trimmed = originalInnerHtml.trim();
  const emphasis = trimmed.match(/^<(strong|b|em|i|span)(\s[^>]*)?>([\s\S]*)<\/\1>$/i);

  if (emphasis && decodeHtmlText(emphasis[3]) === decodeHtmlText(trimmed)) {
    return `${leading}<${emphasis[1]}${emphasis[2] ?? ''}>${escaped}</${emphasis[1]}>${trailing}`;
  }
  return `${leading}${escaped}${trailing}`;
}

export function applyBodyBlockTranslations(
  html: string,
  translations: Array<{ id: string; text: string }>,
): string {
  const translatedById = new Map(
    translations
      .filter((item) => item && typeof item.id === 'string' && typeof item.text === 'string')
      .map((item) => [item.id, item.text.trim().slice(0, 500)]),
  );

  let repaired = html;
  for (const block of findUntranslatedBlockMatches(html).reverse()) {
    const translated = translatedById.get(block.id);
    if (!translated) continue;
    const replacement = translatedInnerHtml(block.innerHtml, translated);
    repaired = `${repaired.slice(0, block.contentStart)}${replacement}${repaired.slice(block.contentEnd)}`;
  }
  return repaired;
}

export interface TableCellForVerification {
  id: string;
  currentText: string;
}

interface TableCellMatch extends TableCellForVerification {
  contentStart: number;
  contentEnd: number;
  innerHtml: string;
}

const TABLE_UNIT_WORDS = new Set([
  'cm', 'mm', 'm', 'in', 'inch', 'inches', 'g', 'kg', 'oz', 'yd', 'yds', 'yard', 'yards',
]);

function findTextualTableCellMatches(html: string): TableCellMatch[] {
  const cellPattern = /<(th|td)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
  const matches: TableCellMatch[] = [];
  let match: RegExpExecArray | null;

  while ((match = cellPattern.exec(html)) !== null) {
    const full = match[0];
    const innerHtml = match[3];
    if (/\[\s*(?:IMG|ROW)[_\s-]?\d+\s*\]/i.test(innerHtml) || /<img\b/i.test(innerHtml)) continue;

    const currentText = decodeHtmlText(innerHtml);
    const words = normalizedLetterWords(currentText);
    if (words.length === 0 || words.every((word) => TABLE_UNIT_WORDS.has(word))) continue;
    if (currentText.length > 500) continue;

    const openingTagEnd = full.indexOf('>') + 1;
    const closingTagStart = full.toLowerCase().lastIndexOf(`</${match[1].toLowerCase()}`);
    matches.push({
      id: `table-cell-${matches.length + 1}`,
      currentText,
      contentStart: match.index + openingTagEnd,
      contentEnd: match.index + closingTagStart,
      innerHtml,
    });
  }

  return matches;
}

export function extractTableCellsForVerification(html: string): TableCellForVerification[] {
  return findTextualTableCellMatches(html).map(({ id, currentText }) => ({ id, currentText }));
}

export function applyTableCellTranslations(
  html: string,
  translations: Array<{ id: string; text: string }>,
): string {
  const translatedById = new Map(
    translations
      .filter((item) => item && typeof item.id === 'string' && typeof item.text === 'string')
      .map((item) => [item.id, item.text.trim().slice(0, 500)]),
  );

  let repaired = html;
  for (const cell of findTextualTableCellMatches(html).reverse()) {
    const translated = translatedById.get(cell.id);
    if (!translated) continue;
    const replacement = translatedInnerHtml(cell.innerHtml, translated);
    repaired = `${repaired.slice(0, cell.contentStart)}${replacement}${repaired.slice(cell.contentEnd)}`;
  }
  return repaired;
}

export interface InlineEmphasisHint {
  originalText: string;
  boldTexts: string[];
}

export interface InlineEmphasisCandidate {
  id: string;
  originalText: string;
  currentText: string;
  boldSourceTexts: string[];
}

interface InlineEmphasisMatch extends InlineEmphasisCandidate {
  contentStart: number;
  contentEnd: number;
  innerHtml: string;
}

function normalizedEmphasisText(value: string): string {
  return decodeHtmlText(value)
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function inlineTextContent(value: string): string {
  return decodeHtmlText(value).replace(/\s+([,.;:!?%)\]])/g, '$1');
}

function emphasisContextsMatch(first: string, second: string): boolean {
  if (first === second) return true;
  const shorter = first.length <= second.length ? first : second;
  const longer = first.length > second.length ? first : second;
  return shorter.length >= 12 && shorter.length / longer.length >= 0.35 && longer.includes(shorter);
}

export function extractSourceInlineEmphasisHints(html: string): InlineEmphasisHint[] {
  const blockPattern = /<(h[1-4]|p|li|th|td)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi;
  const hints: InlineEmphasisHint[] = [];
  let blockMatch: RegExpExecArray | null;

  while ((blockMatch = blockPattern.exec(html)) !== null) {
    const innerHtml = blockMatch[2];
    const boldPattern = /<(strong|b)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi;
    const boldTexts: string[] = [];
    let boldMatch: RegExpExecArray | null;

    while ((boldMatch = boldPattern.exec(innerHtml)) !== null) {
      const text = decodeHtmlText(boldMatch[2]);
      if (text && !boldTexts.includes(text)) boldTexts.push(text);
    }

    const originalText = inlineTextContent(innerHtml);
    if (originalText && boldTexts.length > 0) hints.push({ originalText, boldTexts });
  }

  return hints;
}

function findInlineEmphasisMatches(
  html: string,
  hints: InlineEmphasisHint[],
): InlineEmphasisMatch[] {
  const blockPattern = /<(h[1-4]|p|li|th|td)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
  const normalizedHints = hints
    .map((hint) => ({ ...hint, normalized: normalizedEmphasisText(hint.originalText) }))
    .filter((hint) => hint.normalized.length > 0 && hint.boldTexts.length > 0);
  const matches: InlineEmphasisMatch[] = [];
  let match: RegExpExecArray | null;

  while ((match = blockPattern.exec(html)) !== null) {
    const full = match[0];
    const attributes = match[2];
    const innerHtml = match[3];
    const dataOriginal = attributes.match(/\bdata-o\s*=\s*"([\s\S]*?)"/i)
      ?? attributes.match(/\bdata-o\s*=\s*'([\s\S]*?)'/i);
    if (!dataOriginal?.[1]) continue;

    const originalText = decodeHtmlText(dataOriginal[1]);
    const normalizedOriginal = normalizedEmphasisText(originalText);
    const matchingHints = normalizedHints.filter((hint) =>
      emphasisContextsMatch(normalizedOriginal, hint.normalized));
    if (matchingHints.length === 0) continue;

    const boldSourceTexts = [...new Set(matchingHints.flatMap((hint) => hint.boldTexts))];
    const openingTagEnd = full.indexOf('>') + 1;
    const closingTagStart = full.toLowerCase().lastIndexOf(`</${match[1].toLowerCase()}`);
    matches.push({
      id: `emphasis-${matches.length + 1}`,
      originalText,
      currentText: decodeHtmlText(innerHtml),
      boldSourceTexts,
      contentStart: match.index + openingTagEnd,
      contentEnd: match.index + closingTagStart,
      innerHtml,
    });
  }

  return matches;
}

export function extractInlineEmphasisCandidates(
  html: string,
  hints: InlineEmphasisHint[],
): InlineEmphasisCandidate[] {
  return findInlineEmphasisMatches(html, hints).map(
    ({ id, originalText, currentText, boldSourceTexts }) => ({
      id,
      originalText,
      currentText,
      boldSourceTexts,
    }),
  );
}

function wrapExactTextFragment(innerHtml: string, targetText: string): string {
  const trimmedTarget = targetText.trim();
  if (!trimmedTarget) return innerHtml;

  const existingBoldPattern = /<(strong|b)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi;
  let existingBold: RegExpExecArray | null;
  while ((existingBold = existingBoldPattern.exec(innerHtml)) !== null) {
    if (decodeHtmlText(existingBold[2]) === trimmedTarget) return innerHtml;
  }

  const rawTargets = [trimmedTarget, escapeHtmlText(trimmedTarget)];
  const parts = innerHtml.split(/(<[^>]+>)/g);
  let boldDepth = 0;

  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    if (part.startsWith('<')) {
      if (/^<(?:strong|b)\b/i.test(part)) boldDepth += 1;
      if (/^<\/(?:strong|b)\b/i.test(part)) boldDepth = Math.max(0, boldDepth - 1);
      continue;
    }
    if (boldDepth > 0) continue;

    for (const rawTarget of rawTargets) {
      let position = part.indexOf(rawTarget);
      if (position < 0) position = part.toLocaleLowerCase().indexOf(rawTarget.toLocaleLowerCase());
      if (position < 0) continue;

      const matchedText = part.slice(position, position + rawTarget.length);
      parts[index] = `${part.slice(0, position)}<strong>${matchedText}</strong>${part.slice(position + rawTarget.length)}`;
      return parts.join('');
    }
  }

  return innerHtml;
}

export function applyInlineEmphasisRepairs(
  html: string,
  hints: InlineEmphasisHint[],
  repairs: Array<{ id: string; boldTexts: string[] }>,
): string {
  const repairsById = new Map(
    repairs
      .filter((repair) => repair && typeof repair.id === 'string' && Array.isArray(repair.boldTexts))
      .map((repair) => [
        repair.id,
        repair.boldTexts.filter((text): text is string => typeof text === 'string' && text.trim().length > 0),
      ]),
  );

  let repaired = html;
  for (const block of findInlineEmphasisMatches(html, hints).reverse()) {
    const boldTexts = repairsById.get(block.id);
    if (!boldTexts?.length) continue;
    const replacement = boldTexts.reduce(wrapExactTextFragment, block.innerHtml);
    repaired = `${repaired.slice(0, block.contentStart)}${replacement}${repaired.slice(block.contentEnd)}`;
  }
  return repaired;
}

export type DanishQaIssue =
  | 'MERGED_TOKEN'
  | 'MERGED_WORDS'
  | 'REPEATED_WORD'
  | 'DUPLICATE_HEADING'
  | 'MIXED_LANGUAGE_PARENTHETICAL'
  | 'EDITORIAL_NOTE'
  | 'SOURCE_TERMINOLOGY';

export interface DanishQaBlock {
  id: string;
  originalText: string;
  currentText: string;
  issues: DanishQaIssue[];
}

interface DanishQaMatch extends DanishQaBlock {
  tagName: string;
  fullStart: number;
  fullEnd: number;
  contentStart: number;
  contentEnd: number;
  innerHtml: string;
}

function detectDanishQaIssues(text: string): DanishQaIssue[] {
  const issues: DanishQaIssue[] = [];
  if (/(?<![\p{L}\p{N}])pmsm(?![\p{L}\p{N}])/iu.test(text)) issues.push('MERGED_TOKEN');
  if (/(?<![\p{L}\p{N}])tilpå(?![\p{L}\p{N}])/iu.test(text)) issues.push('MERGED_WORDS');
  if (/(?<![\p{L}])([\p{L}]{3,})\s+\1(?![\p{L}])/iu.test(text)) issues.push('REPEATED_WORD');
  if (/\([^)]*\b(?:continue|continued|work|knit|purl|stitches?|rows?|rounds?|repeat|place|slip|marker|hold|check)\b[^)]*\)/iu.test(text)) {
    issues.push('MIXED_LANGUAGE_PARENTHETICAL');
  }
  if (/\b(?:translator(?:'s)? note|translation note|editor(?:'s)? note|todo|check this|replace with)\b/iu.test(text)) {
    issues.push('EDITORIAL_NOTE');
  }
  if (/\b(?:toddler|positive ease|sweater version|charted cable instructions|put stitches on hold|remain on hold|right side|wrong side)\b/iu.test(text)) {
    issues.push('SOURCE_TERMINOLOGY');
  }
  return issues;
}

function findDanishQaMatches(html: string): DanishQaMatch[] {
  const blockPattern = /<(h[1-4]|p|li|th|td)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
  const matches: DanishQaMatch[] = [];
  let match: RegExpExecArray | null;

  while ((match = blockPattern.exec(html)) !== null) {
    const full = match[0];
    const tagName = match[1].toLowerCase();
    const attributes = match[2];
    const innerHtml = match[3];
    const currentText = inlineTextContent(innerHtml);
    if (!currentText || /\[\s*(?:IMG|ROW)[_\s-]?\d+\s*\]/i.test(currentText)) continue;

    const dataOriginal = attributes.match(/\bdata-o\s*=\s*"([\s\S]*?)"/i)
      ?? attributes.match(/\bdata-o\s*=\s*'([\s\S]*?)'/i);
    const openingTagEnd = full.indexOf('>') + 1;
    const closingTagStart = full.toLowerCase().lastIndexOf(`</${tagName}`);
    matches.push({
      id: `da-qa-${matches.length + 1}`,
      tagName,
      originalText: decodeHtmlText(dataOriginal?.[1] ?? ''),
      currentText,
      issues: detectDanishQaIssues(currentText),
      fullStart: match.index,
      fullEnd: match.index + full.length,
      contentStart: match.index + openingTagEnd,
      contentEnd: match.index + closingTagStart,
      innerHtml,
    });
  }

  for (let index = 1; index < matches.length; index++) {
    const previous = matches[index - 1];
    const current = matches[index];
    if (
      /^h[1-4]$/.test(previous.tagName)
      && /^h[1-4]$/.test(current.tagName)
      && !html.slice(previous.fullEnd, current.fullStart).trim()
      && normalizedEmphasisText(previous.currentText) === normalizedEmphasisText(current.currentText)
    ) {
      current.issues.push('DUPLICATE_HEADING');
    }
  }

  return matches;
}

export function extractDanishQaBlocks(html: string): DanishQaBlock[] {
  return findDanishQaMatches(html).map(({ id, originalText, currentText, issues }) => ({
    id,
    originalText,
    currentText,
    issues,
  }));
}

function extractProtectedNumbers(text: string): string[] {
  return text.match(/\d+(?:[.,]\d+)?(?:\s*[–—-]\s*\d+(?:[.,]\d+)?)?(?:\/\d+(?:[.,]\d+)?)?/g) ?? [];
}

function extractProtectedUnits(text: string): string[] {
  const units: string[] = [];
  // Bare `m` is intentionally excluded: in Danish knitting prose it is the
  // standard abbreviation for maske/masker and commonly follows a stitch count.
  const measurementPattern = /\d+(?:[.,]\d+)?(?:\s*[–—-]\s*\d+(?:[.,]\d+)?)?\s*(cm|mm|in|g|kg|yd|yds)(?![\p{L}\p{N}])/gu;
  let match: RegExpExecArray | null;
  while ((match = measurementPattern.exec(text)) !== null) units.push(match[1]);
  return units;
}

function extractMarkerSequence(text: string): Array<'pm' | 'sm' | 'fm'> {
  return (text.toLocaleLowerCase().match(/(?<![\p{L}\p{N}])(?:pm|sm|fm)(?![\p{L}\p{N}])/gu) ?? []) as Array<'pm' | 'sm' | 'fm'>;
}

function sequenceContains<T>(actual: T[], expected: T[]): boolean {
  let expectedIndex = 0;
  for (const item of actual) {
    if (item === expected[expectedIndex]) expectedIndex += 1;
  }
  return expectedIndex === expected.length;
}

function isSafeDanishQaRepair(block: DanishQaBlock, replacement: string): boolean {
  const reference = block.originalText || block.currentText;
  if (JSON.stringify(extractProtectedNumbers(reference)) !== JSON.stringify(extractProtectedNumbers(replacement))) {
    return false;
  }
  if (JSON.stringify(extractProtectedUnits(reference)) !== JSON.stringify(extractProtectedUnits(replacement))) {
    return false;
  }

  if (block.originalText) {
    const sourceMarkers = extractMarkerSequence(block.originalText).filter((token) => token !== 'fm');
    const expectedMarkers = sourceMarkers.map((token) => token === 'sm' ? 'fm' : 'pm');
    const targetMarkers = extractMarkerSequence(replacement);
    const sourcePmCount = sourceMarkers.filter((token) => token === 'pm').length;
    const targetPmCount = targetMarkers.filter((token) => token === 'pm').length;
    if (sourcePmCount !== targetPmCount || targetMarkers.includes('sm')) return false;
    if (!sequenceContains(targetMarkers, expectedMarkers)) return false;
  }

  return true;
}

export function applyDanishQaRepairs(
  html: string,
  blocks: DanishQaBlock[],
  repairs: Array<{ id: string; text: string; remove?: boolean }>,
): string {
  const blocksById = new Map(blocks.map((block) => [block.id, block]));
  const repairsById = new Map(
    repairs.filter((repair) => repair && typeof repair.id === 'string').map((repair) => [repair.id, repair]),
  );

  let repaired = html;
  for (const match of findDanishQaMatches(html).reverse()) {
    const block = blocksById.get(match.id);
    const repair = repairsById.get(match.id);
    if (!block || !repair) continue;

    if (repair.remove === true) {
      if (block.issues.includes('DUPLICATE_HEADING') && /^h[1-4]$/.test(match.tagName)) {
        repaired = `${repaired.slice(0, match.fullStart)}${repaired.slice(match.fullEnd)}`;
      }
      continue;
    }

    if (typeof repair.text !== 'string') continue;
    const text = repair.text.trim();
    if (!text || !isSafeDanishQaRepair(block, text)) continue;
    const replacement = translatedInnerHtml(match.innerHtml, text);
    repaired = `${repaired.slice(0, match.contentStart)}${replacement}${repaired.slice(match.contentEnd)}`;
  }
  return repaired;
}

function canonicalProtectedNumbers(text: string): string[] {
  return extractProtectedNumbers(text).map((token) => token
    .replace(/,/g, '.')
    .replace(/\s*[‐‑‒–—-]\s*/g, '–'));
}

function isSafeLocalizedQaRepair(block: DanishQaBlock, replacement: string): boolean {
  const reference = block.originalText || block.currentText;
  return (
    JSON.stringify(canonicalProtectedNumbers(reference)) === JSON.stringify(canonicalProtectedNumbers(replacement))
    && JSON.stringify(extractProtectedUnits(reference)) === JSON.stringify(extractProtectedUnits(replacement))
  );
}

function extractSelectedTokens(text: string, tokens: string[]): string[] {
  const alternatives = [...tokens]
    .sort((a, b) => b.length - a.length)
    .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  if (!alternatives) return [];
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives})(?![\\p{L}\\p{N}])`, 'giu');
  return (text.match(pattern) ?? []).map((token) => token.toLocaleLowerCase());
}

function isSafeSpanishQaRepair(block: DanishQaBlock, replacement: string): boolean {
  if (!isSafeLocalizedQaRepair(block, replacement)) return false;
  if (!block.originalText) return true;

  const mapping: Record<string, string> = {
    pm: 'pm',
    sm: 'dm',
    bor: 'cv',
    rs: 'ld',
    ws: 'lr',
    sts: 'pts',
    m1r: 'a1d',
    m1l: 'a1i',
    k2tog: '2pjd',
  };
  const sourceTokens = extractSelectedTokens(block.originalText, Object.keys(mapping));
  if (sourceTokens.length === 0) return true;
  const expected = sourceTokens.map((token) => mapping[token]);
  const targetTokens = extractSelectedTokens(replacement, [
    ...Object.keys(mapping),
    ...Object.values(mapping),
  ]);
  const forbidden = new Set(['sm', 'bor', 'rs', 'ws', 'sts', 'm1r', 'm1l', 'k2tog']);
  if (targetTokens.some((token) => forbidden.has(token))) return false;
  return sequenceContains(targetTokens, expected);
}

function applyLocalizedQaRepairs(
  html: string,
  blocks: DanishQaBlock[],
  repairs: Array<{ id: string; text: string; remove?: boolean }>,
  isSafe: (block: DanishQaBlock, replacement: string) => boolean,
): string {
  const blocksById = new Map(blocks.map((block) => [block.id, block]));
  const repairsById = new Map(repairs.map((repair) => [repair.id, repair]));
  let repaired = html;

  for (const match of findDanishQaMatches(html).reverse()) {
    const block = blocksById.get(match.id);
    const repair = repairsById.get(match.id);
    if (!block || !repair) continue;
    if (repair.remove === true) {
      if (block.issues.includes('DUPLICATE_HEADING') && /^h[1-4]$/.test(match.tagName)) {
        repaired = `${repaired.slice(0, match.fullStart)}${repaired.slice(match.fullEnd)}`;
      }
      continue;
    }
    const text = typeof repair.text === 'string' ? repair.text.trim() : '';
    if (!text || !isSafe(block, text)) continue;
    const replacement = translatedInnerHtml(match.innerHtml, text);
    repaired = `${repaired.slice(0, match.contentStart)}${replacement}${repaired.slice(match.contentEnd)}`;
  }
  return repaired;
}

export function applySpanishQaRepairs(
  html: string,
  blocks: DanishQaBlock[],
  repairs: Array<{ id: string; text: string; remove?: boolean }>,
): string {
  return applyLocalizedQaRepairs(html, blocks, repairs, isSafeSpanishQaRepair);
}

export function applyFrenchQaRepairs(
  html: string,
  blocks: DanishQaBlock[],
  repairs: Array<{ id: string; text: string; remove?: boolean }>,
): string {
  return applyLocalizedQaRepairs(html, blocks, repairs, isSafeLocalizedQaRepair);
}

function headingNeedsVerification(heading: CoverHeadingMatch): boolean {
  if (!heading.hasOriginalText) return true;
  const sourceWords = normalizedWords(heading.originalText);
  const currentWords = new Set(normalizedWords(heading.currentText));
  if (sourceWords.length === 0) return false;
  const overlap = sourceWords.filter((word) => currentWords.has(word)).length / sourceWords.length;
  return overlap >= 0.7;
}

export function createTitleRepairSystemInstruction(language: string, sourceLanguage?: string): string {
  const source = sourceLanguage ? `The source language is ${sourceLanguage}. ` : '';
  return `You are the final cover-title quality check for a knitting-pattern translation. ${source}Return corrected cover headings in ${language}.

Rules:
- Translate every descriptive word: garment types, age groups, audience labels, and conjunctions. Do not copy them merely because they appear in a title or use title case.
- Preserve only genuine proper names, designer/brand names, usernames, and product codes.
- For "Lazos Sweater & Vest", preserve "Lazos" but translate "Sweater & Vest" naturally into ${language}.
- Translate "Baby & Toddler" naturally into ${language}; it is a descriptive subtitle, not a product name.
- Return exactly one plain-text translation for every supplied id. Do not add HTML, explanations, quotation marks, or extra headings.`;
}

export function createBodyResidueRepairSystemInstruction(
  language: string,
  sourceLanguage?: string,
): string {
  const source = sourceLanguage ? `The source language is ${sourceLanguage}. ` : '';
  return `You are the final source-language residue check for a knitting-pattern translation. ${source}Translate each supplied unchanged body block into ${language}.

Rules:
- Translate every descriptive word. "Sweater version:" and "Vest version:" are descriptive labels, not product names, and must be localized naturally.
- Preserve only genuine proper names, designer/brand names, usernames, and product codes.
- Preserve all numbers, units, punctuation, parentheses, and measurement notation exactly. Do not add, remove, or reorder size values.
- Return exactly one plain-text translation for every supplied id. Do not add HTML, explanations, quotation marks, or extra blocks.`;
}

export function createTableCellRepairSystemInstruction(
  language: string,
  sourceLanguage?: string,
): string {
  const source = sourceLanguage ? `The source language is ${sourceLanguage}. ` : '';
  return `You are the final table-localization quality check for a knitting-pattern translation. ${source}Return every table header and every textual table cell in natural ${language}.

Rules:
- Translate all human-language table text, including labels such as "Size", "Chest circumference", "V neck depth", "Newborn", and age ranges containing "months" or "years". Table labels are not international terminology.
- If a supplied cell is already correct ${language}, return it unchanged.
- Preserve all numbers, decimal separators, units, punctuation, parentheses, dashes, and measurement notation exactly. Never add, remove, or reorder size values.
- Preserve genuine product names and designer/brand names, but translate garment types and descriptive labels.
- Return exactly one plain-text value for every supplied id. Do not add HTML, explanations, quotation marks, rows, or columns.`;
}

export function createInlineEmphasisRepairSystemInstruction(
  language: string,
  sourceLanguage?: string,
): string {
  const source = sourceLanguage ? `The source language is ${sourceLanguage}. ` : '';
  return `You are the final inline-formatting quality check for a knitting-pattern translation. ${source}Identify the same semantic fragments in ${language} that were bold in the source.

Rules:
- For each supplied block, map every boldSourceText to its translated equivalent in currentText.
- A glossary abbreviation and its colon must stay bold when that abbreviation and colon were bold in the source.
- In size lists, bold only the exact size entries that were bold in the source. Never infer a new alternating pattern or bold adjacent parenthesized sizes.
- Every returned boldText must be an exact substring copied from the supplied current translated text, with identical spelling, punctuation, accents, and capitalization.
- Return every supplied id. Return boldTexts as an array of plain-text fragments only; do not return HTML, explanations, or quotation marks around individual fragments.`;
}

export function createDanishQaSystemInstruction(sourceLanguage?: string): string {
  const source = sourceLanguage ? `The source language is ${sourceLanguage}. ` : '';
  return `You are the final native-Danish knitting-pattern editor. ${source}Review all supplied blocks together and return only necessary corrections.

Native-reviewed terminology:
- toddler -> småbørn
- this garment/sweater -> trøje or trøjen, never generic tøj
- positive ease -> bevægelsesrum
- put stitches on hold -> sæt maskerne til hvile; remain on hold -> maskerne hviler fortsat
- sweater version -> Sweater-versionen
- charted cable instructions -> snoningsdiagrammer
- skein -> nøgle or nøglen with correct inflection
- preserve pm exactly and define it as "Placer markør"; translate source sm (slip marker) to fm and define it as "Flyt markør"
- right side -> retsiden; wrong side -> vrangsiden

Required QA:
- Protect knitting abbreviations as tokens. Never infer that pm and sm are interchangeable. Compare every pm and every sm occurrence against the source; source pm stays pm and source sm becomes fm.
- Preserve every number, cm, in, size range, stitch count, row number, and chart reference exactly.
- Check for merged/overlapping fragments such as pmsm and tilpå, repeated nouns, doubled headings, and old and new text appearing together.
- Run a terminology-consistency scan across the construction summary, shoulders, neckline, sleeves, glossary, and chart legend.
- Remove mixed-language parentheticals, editing instructions, English explanations, translator notes, TODOs, and replacement suggestions from the finished translation.
- Prefer direct, concise Danish knitting instructions: "Begynd at strikke…" and "forstykket strikkes nu videre efter kropsdiagrammet", not "Du vil begynde at strikke…".
- Apply Danish compound and heading conventions consistently, including "Sweater-versionen" and "Samling af forstykke".
- Validate natural Danish punctuation; do not mechanically retain English comma patterns except punctuation that encodes size grouping.

Output rules:
- Return a repairs array containing only blocks that need a correction.
- text must be the complete corrected plain text for that block, with no HTML.
- Set remove=true only for a block explicitly marked DUPLICATE_HEADING; otherwise remove=false.
- Do not add explanations, notes, comments, or new content.`;
}

export function createSpanishQaSystemInstruction(sourceLanguage?: string): string {
  const source = sourceLanguage ? `The source language is ${sourceLanguage}. ` : '';
  return `You are the final native-Spanish knitting-pattern editor. ${source}Review complete instructional blocks together and return only necessary corrections.

Required terminology and context:
- When worked flat, translate row/rows as fila/filas; when worked in the round, translate round/rounds as vuelta/vueltas. Compare every row and round against the source construction context.
- In a vest armhole-edging section, "right sleeve" means sisa derecha; elsewhere sleeve means manga.
- Use remate italiano for Italian/tubular bind-off, adding "en circular" when appropriate; puntos disminuidos; marcador con cierre; con el LD de la labor hacia ti; trabaja el gráfico según corresponda; bloqueo; bloqueo intermedio.
- Keep BOR as CV (comienzo de vuelta), sm as dm, and pm as pm. Use LD, LR, CV, pts, A1D, A1I, 2pjD, dm, and pm consistently.
- Use agujas de mayor grosor / agujas de menor grosor and el cabo suelto del hilo.
- Replace vague chart references with the specific chart name and size from the source. Use present-tense "como se indica arriba".

Required validation:
- Preserve every value and unit system. Use decimal commas, spaces before units, and en dashes, and confirm every sequence retains the same number of sizes and measurements as the source.
- Preserve paragraph meaning and do not add English explanations, translator notes, or editing instructions.
- Detect merged fragments, repeated text, omitted phrases, inconsistent terms, and literal Markdown artefacts such as **, __, backticks, or Markdown heading markers.
- Return complete corrected plain text per block, never HTML. Return only changed blocks and do not alter source identifiers.`;
}

export function createFrenchQaSystemInstruction(sourceLanguage?: string): string {
  const source = sourceLanguage ? `The source language is ${sourceLanguage}. ` : '';
  return `You are the final native-French knitting-pattern editor. ${source}Review complete instructional sentences, never isolated word substitutions, and return only necessary corrections.

Required terminology:
- Use la bordure, maille in explanatory prose, tour for knitting in the round, ouvrage/partie du corps by context, aiguille à laine, rang de montage, Prendre les aiguilles…, pré-bloquez, and QR code.
- Prefer idiomatic French: trouverez, possède, indiqué, regroupées, mesurer à nouveau. Check agreement, articles, and use le bon échantillon.

Required validation:
- Compare every translated segment with its English source to detect omissions, incomplete phrases, and missing articles, nouns, and connectors.
- Detect duplicated glossary definitions, repeated wording, redundant phrases, and untranslated English notes.
- Validate terminology consistently across prose, abbreviations, glossary, and charts/chart legends.
- Make cross-references natural in their complete sentence.
- Preserve meaningful emphasis on the equivalent translated phrase.
- Low-confidence terminology must be marked for manual review; keep the safest source-faithful wording and never silently choose a literal calque.
- Return complete corrected plain text per block, never HTML. Return only changed blocks and do not add explanations or translator notes.`;
}

const titleRepairSchema = {
  type: Type.OBJECT,
  properties: {
    translations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          text: { type: Type.STRING },
        },
        required: ['id', 'text'],
      },
    },
  },
  required: ['translations'],
};

const inlineEmphasisRepairSchema = {
  type: Type.OBJECT,
  properties: {
    repairs: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          boldTexts: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: ['id', 'boldTexts'],
      },
    },
  },
  required: ['repairs'],
};

const danishQaRepairSchema = {
  type: Type.OBJECT,
  properties: {
    repairs: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          text: { type: Type.STRING },
          remove: { type: Type.BOOLEAN },
        },
        required: ['id', 'text', 'remove'],
      },
    },
  },
  required: ['repairs'],
};

const localizedQaRepairSchema = {
  type: Type.OBJECT,
  properties: {
    repairs: danishQaRepairSchema.properties.repairs,
    manualReview: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          reason: { type: Type.STRING },
        },
        required: ['id', 'reason'],
      },
    },
  },
  required: ['repairs', 'manualReview'],
};

export const createSystemInstruction = (language: string, sourceLanguage?: string) => {
  const specificRules = getLanguageSpecificRules(language);

  const sourceClause = sourceLanguage
    ? `The source pattern is written in ${sourceLanguage}. `
    : 'Auto-detect the source language of the pattern. ';

  return `You are a world-class senior knitting pattern translator and technical document designer. ${sourceClause}Your goal is to translate patterns into ${language} with extreme technical precision, reconstructing every visual element including tables and charts.

### 1. TABLE & CHART RECONSTRUCTION (CRITICAL):
- **TABLES**: If you see rows/columns of data (e.g., measurement tables or stitch count tables), you MUST reconstruct them using HTML <table>, <thead>, <tbody>, <tr>, and <td> tags. Add a border="1" attribute or use styles to ensure they are visible.
- **TRANSLATE EVERY TEXTUAL CELL**: Translate every human-language <th> and <td>, including measurement headings, garment-part labels, and written size/age labels such as "Size", "Chest circumference", "Newborn", "months", and "years". Table text is not international terminology and must not remain in the source language.
- **PRESERVE TABLE DATA**: Keep numeric measurements, decimal separators, units, symbols, parentheses, dashes, column order, and size order exactly as supplied. Translate the words around those values without altering the values themselves.
- **STITCH CHARTS**: If the PDF contains a grid/chart representing a stitch pattern, you MUST reconstruct it as an HTML table. Each cell in the table should represent one square of the chart. Translate any symbols in the chart legend accurately.
- **NO SKIPPING**: Do not summarize tables or skip charts. Every piece of technical data in the PDF must be present in the HTML output.

### 1b. STITCH CHART LEGENDS (CRITICAL — OVERRIDES ROW GROUPS):
A "chart legend" (a.k.a. symbol key / leyenda de símbolos) is the small key, usually adjacent to or below a stitch chart, where each entry pairs a tiny stitch symbol (image square OR drawn chart cell / glyph) with a short text description of what that symbol means — often English abbreviations such as k2tog, ssk, CDD, knit, yarn over even when the rest of the pattern is in another language.

Whenever you detect this pattern in the source — including any IMAGE CATALOG items marked as "likely stitch-chart LEGEND SYMBOL" or listed under "STITCH-CHART LEGEND CANDIDATES", AND also when the legend is plain text / chart cells without separate images — you MUST reconstruct the legend as a dedicated HTML <table> with EXACTLY 2 columns and one row per legend entry:
  1. **First column (the symbol)**:
     - If an extracted symbol image exists: ONLY the bare \`[IMG_N]\` marker (no <p> wrapper, no caption, no translation, no extra text). Preserve the original image AS-IS — do NOT redraw or describe it.
     - If there is no separate image: put the original chart symbol glyph / cell content (e.g. /, \\, O, blank knit square) in the cell, preserving its visual meaning.
  2. **Second column (the meaning)**: contains ONLY the TRANSLATED ${language} description of that stitch (localized abbreviation AND/OR full term). Do NOT keep English or any other source-language text in this column.

HARD RULES for legend meanings:
- Leaving English knitting abbreviations untranslated (k2tog, ssk, CDD, knit, yarn over, yo, K, P, etc.) is a hard failure.
- Mixed-language sources are common (e.g. French written rounds + English legend). Translate the legend into ${language} anyway — English abbreviations are NOT "international" and MUST be localized.
- Prefer the localized abbreviation plus a short full term when helpful (e.g. Spanish: "2pjD (2 puntos juntos derecho)").

This legend table ALWAYS takes priority over IMAGE ROW GROUPS. Even if a legend symbol appears in a ROW group in the catalog, you MUST still place its bare \`[IMG_N]\` inside a legend \`<td>\` and you MUST NOT emit \`[ROW_N]\` for those legend-symbol members. Dumping the symbols as a photo strip / \`<p>[ROW_N]</p>\` / \`<p>[IMG_N]</p>\` blocks without a translated meaning column is a hard failure.

Use this exact table structure for legends:
\`\`\`
<table style="width: auto; border-collapse: collapse; margin: 1em 0; border: 1px solid #ccc;">
  <thead><tr><th style="padding: 0.4em 0.75em; text-align: center;">Symbol</th><th style="padding: 0.4em 0.75em; text-align: left;">Meaning</th></tr></thead>
  <tbody>
    <tr><td style="padding: 0.3em 0.5em; text-align: center; vertical-align: middle; width: 56px;">[IMG_5]</td><td style="padding: 0.3em 0.75em; vertical-align: middle;">Translated description here</td></tr>
    <tr><td style="padding: 0.3em 0.5em; text-align: center; vertical-align: middle; width: 56px;">[IMG_6]</td><td style="padding: 0.3em 0.75em; vertical-align: middle;">Translated description here</td></tr>
  </tbody>
</table>
\`\`\`
The header labels themselves ("Symbol" / "Meaning") must be translated into ${language} (e.g. Spanish: "Símbolo" / "Significado"; French: "Symbole" / "Signification"; etc.). Each legend symbol image must appear EXACTLY ONCE — inside its legend cell. Do NOT also emit a separate \`<p>[IMG_N]</p>\` or \`<p>[ROW_N]</p>\` for that same symbol.

${createSizeFormatPreservationRules(2)}

${createTitleTranslationRules(3, language)}

### 4. LANGUAGE & TECHNICAL RULES:
- **NO SOURCE LANGUAGE IN GLOSSARY**: Remove source-language abbreviations unless a language-specific rule explicitly requires preserving a token (for example Danish pm). The glossary must contain the approved ${language} abbreviation and its full definition.
- **100% LOCALIZED**: Use the specific localized abbreviations for ${language} (e.g., MO, Rem, H, 2pjD, ddD, DDC), subject to explicit language-specific token-preservation rules. Never leave English chart/glossary forms such as k2tog, ssk, CDD, knit, or yarn over when the target is not English.
- **PUNCTUATION**: Maintain the exact punctuation (brackets, colons, slashes) used in the original for sizing.
- **INLINE BOLD IS SOURCE DATA**: Preserve every source bold fragment with <strong> in the translated equivalent. In glossary entries, keep the abbreviation/prefix bold when it is bold in the source. In size lists, keep exactly the same size slots bold and do not invent a new alternating pattern.

### 4b. DECORATIVE OR IMAGE-BASED HEADINGS (CRITICAL):
- Visible words drawn inside an image, banner, shape, or decorative script still count as text when they serve as a section heading. Read, translate, and emit every such section heading in the correct reading position.
- A decorative source title such as "Materials Needed" must become a translated semantic <h2>; it must never disappear merely because its lettering is rasterized or stylized.
- Replace any text-only heading graphic with a translated semantic heading instead of preserving source-language words as an image. This is an explicit exception to the rule that every IMAGE CATALOG item needs a marker.
- If the graphic contains meaningful illustration in addition to its heading text, keep its image marker and also add the translated semantic heading immediately beside or below it. Do not duplicate the source wording as visible text.
- Every TYPOGRAPHY HINT that represents a real heading must have one equivalent translated heading in the output. Before responding, compare every visible section boundary in the PDF against the emitted <h2>/<h3>/<h4> sequence and restore anything missing.

### 5. OUTPUT FORMAT:
- Output raw semantic HTML5 wrapped in a single <div>.
- Use real semantic headings: <h1> for the pattern title, <h2> for major sections (Materials, Gauge, Abbreviations, Pattern, Finishing, etc.), <h3> for sub-sections, and <h4> for sub-sub-sections.
- THERE MUST BE EXACTLY ONE <h1> IN THE ENTIRE DOCUMENT: the cover/pattern title. Every major section heading (e.g. Sizes, Materials, Gauge, Glossary, Body, Neck, Finishing, Charts) MUST be <h2> — never <h1> — even if it appears large in the source. Do not promote section headings to <h1> just because their font is big.
- Use <strong> ONLY where the source uses bold for inline emphasis or size markers, and for true inline emphasis in translated text. NEVER use <strong> as a section header.
- For tables, use <table> with styles: "width: 100%; border-collapse: collapse; margin: 10px 0; border: 1px solid #ccc;".
- For table cells, use padding and center-alignment where appropriate.
- DO NOT use markdown code blocks (\`\`\`html).
- Never emit literal Markdown emphasis or heading syntax such as **, __, backticks, or # headings. Use native <strong>/<em> only for the equivalent source text range.

### 6. IMAGE PLACEMENT (CRITICAL - STRICT FORMAT):
- You may be given a numbered list of images extracted from the PDF (an "IMAGE CATALOG").
- Each image has an ID (e.g. IMG_1), a page number, and a description of where it appeared on the page.
- The catalog may also list "IMAGE ROW GROUPS" with IDs like ROW_1. A row group means those images sat side-by-side on the same horizontal row in the original document.
- Some images may be marked as small top-of-page banners or logos. Those must remain above the page title/heading they precede in the original layout.
- You MUST place each image in the translated HTML at the position corresponding to where it appeared in the original document, preserving the original reading order.
- Markers MUST be one of these exact shapes and nothing else:
    1. <p>[IMG_1]</p>  — for a standalone single image (default block-level placement).
    2. <p>[ROW_1]</p>  — for an entire side-by-side row of images. The server expands this into a horizontal flex container with all member images in left-to-right order.
    3. <td ...>[IMG_1]</td>  — bare marker (no <p> wrapper) inside a stitch-chart-legend table cell. The server detects markers inside <td> and renders the image small/inline so it fits the legend row.
- When a ROW group is listed in the catalog, you MUST use the [ROW_N] marker once and you MUST NOT also emit individual [IMG_N] markers for any of that row's members — EXCEPT for stitch-chart legend symbols (see §1b and any "LEGEND SYMBOL" / "LEGEND CANDIDATES" catalog notes). Legend symbols always use form 3 above and never use [ROW_N].
- Each marker (whether IMG or ROW) may appear at most once. Cover every catalog item exactly once via its row marker, its block <p>[IMG_N]</p> marker, OR its legend <td>[IMG_N]</td> cell — never combine forms for the same image. The only exception is a text-only decorative heading graphic: replace it with translated semantic heading text and omit that image marker so source-language lettering is not retained. Logos and non-heading banners remain mandatory and must be emitted via their [IMG_N] markers in their original document position.
- The marker text MUST match this exact structure: opening "[", literal "IMG_" or "ROW_", the integer ID, closing "]". No spaces, no hyphens, no quotes, no markdown, no <code>, and no raw <img> tags.
- Do NOT invent IDs that are not in the catalog. The server will inject the actual images for every valid marker.
- If no IMAGE CATALOG is provided, ignore this section.

### 7. HEADING STYLING (STANDARD TEXT STYLE):
- A TYPOGRAPHY HINTS list may be provided.
- Pattern text must use the app standard typography: Arial and black. Do NOT emit inline font-family or color styles for any text.
- For each hint, when you emit the equivalent translated heading text, use the suggested tag (h1/h2/h3/h4) and, when useful, add only the suggested size in this exact pattern: style="font-size: <ratio>em;"
- Use the exact tag given in each hint. Never emit an inline font-size larger than 2em for any heading.
- Use the same tag and ratio for translated text whose role or position matches the source heading even if the wording changes during translation.
- Preserve obvious decorative styling from the source heading when it is visually clear, especially centered cover titles, underlines, and title placement directly beneath a small top banner/logo image.
- If no hint matches a section, still choose the correct semantic heading tag from the rules above, but omit the inline style.
- If a BODY font hint is provided, ignore its font family and color; use it only as a guide for structure, spacing, or relative sizing.
- If INLINE EMPHASIS hints are provided, translate the listed context but wrap the translated equivalent of every listed BOLD fragment in <strong>. These hints describe source formatting and are mandatory.

### 8. BILINGUAL ALIGNMENT (CRITICAL):
- On EVERY block-level text element you output — specifically <h1>, <h2>, <h3>, <h4>, <p>, and <li> — add TWO attributes:
  1. data-seg="N": a sequential integer starting at 1 and increasing by exactly 1 for each such block in document order. Never skip or repeat a number.
  2. data-o="...": the ORIGINAL, UNTRANSLATED source-language text of that exact block, as PLAIN TEXT (no HTML tags inside). HTML-escape it by replacing & with &amp;, " with &quot;, < with &lt;, and > with &gt;.
- The data-o text must correspond 1:1 to the translated content of the SAME element, so a reader can see which source sentence produced which translation.
- On every textual <th> and <td>, add data-o="..." containing that cell's original plain text, but no data-seg. This lets terminology QA compare table and chart-legend abbreviations with the source.
- Do NOT add data-seg or data-o to <img>, <table>, <thead>, <tbody>, or <tr> elements, or to image/row marker paragraphs such as <p>[IMG_1]</p> or <p>[ROW_1]</p>.
- Example: <p data-seg="4" data-o="Cast on 20 (24, 28) stitches.">Monta 20 (24, 28) puntos.</p>

${specificRules}

The priority is a high-fidelity reconstruction. A pattern is useless without its charts and tables. Ensure they are perfectly translated and formatted as HTML tables.`;
};

interface TranslationUsage {
  promptTokens: number;
  candidateTokens: number;
  totalTokens: number;
}

function mergeTranslationUsage(
  base: TranslationUsage | null,
  extra: TranslationUsage | null,
): TranslationUsage | null {
  if (!base) return extra;
  if (!extra) return base;
  return {
    promptTokens: base.promptTokens + extra.promptTokens,
    candidateTokens: base.candidateTokens + extra.candidateTokens,
    totalTokens: base.totalTokens + extra.totalTokens,
  };
}

async function verifyAndRepairCoverHeadings(
  html: string,
  language: string,
  sourceLanguage: string | undefined,
  signal: AbortSignal | undefined,
): Promise<{ html: string; usage: TranslationUsage | null }> {
  const headingMatches = findCoverHeadingMatches(html);
  if (headingMatches.length === 0 || !headingMatches.some(headingNeedsVerification)) {
    return { html, usage: null };
  }

  try {
    const response = await withRetry(() =>
      getAI().models.generateContent({
        model: TITLE_REPAIR_MODEL,
        config: {
          abortSignal: signal,
          systemInstruction: createTitleRepairSystemInstruction(language, sourceLanguage),
          temperature: 0,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: titleRepairSchema,
        },
        contents: [{
          parts: [{
            text: JSON.stringify({
              targetLanguage: language,
              headings: headingMatches.map(({ id, originalText, currentText }) => ({
                id,
                originalText,
                currentText,
              })),
            }),
          }],
        }],
      }),
    );

    const parsed = JSON.parse(response.text || '{}') as {
      translations?: Array<{ id?: unknown; text?: unknown }>;
    };
    const validIds = new Set(headingMatches.map((heading) => heading.id));
    const translations = (Array.isArray(parsed.translations) ? parsed.translations : [])
      .flatMap((item): Array<{ id: string; text: string }> => {
        if (typeof item?.id !== 'string' || !validIds.has(item.id) || typeof item.text !== 'string') {
          return [];
        }
        const text = item.text.trim();
        return text ? [{ id: item.id, text }] : [];
      });

    const metadata = response.usageMetadata;
    const usage = metadata
      ? {
          promptTokens: metadata.promptTokenCount ?? 0,
          candidateTokens: metadata.candidatesTokenCount ?? 0,
          totalTokens: metadata.totalTokenCount ?? 0,
        }
      : null;

    return {
      html: applyCoverHeadingTranslations(html, translations),
      usage,
    };
  } catch (err) {
    // This is a narrow quality repair after the complete translation already
    // succeeded. If it is unavailable, return the primary result rather than
    // failing and charging/refunding the entire job because of a QA add-on.
    console.warn('[gemini] Cover-title verification skipped:', err);
    return { html, usage: null };
  }
}

async function verifyAndRepairUntranslatedBlocks(
  html: string,
  language: string,
  sourceLanguage: string | undefined,
  signal: AbortSignal | undefined,
): Promise<{ html: string; usage: TranslationUsage | null }> {
  if (sourceLanguage?.trim().toLowerCase() === language.trim().toLowerCase()) {
    return { html, usage: null };
  }

  const blockMatches = findUntranslatedBlockMatches(html);
  if (blockMatches.length === 0) return { html, usage: null };

  try {
    const response = await withRetry(() =>
      getAI().models.generateContent({
        model: TITLE_REPAIR_MODEL,
        config: {
          abortSignal: signal,
          systemInstruction: createBodyResidueRepairSystemInstruction(language, sourceLanguage),
          temperature: 0,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: titleRepairSchema,
        },
        contents: [{
          parts: [{
            text: JSON.stringify({
              targetLanguage: language,
              blocks: blockMatches.map(({ id, originalText, currentText }) => ({
                id,
                originalText,
                currentText,
              })),
            }),
          }],
        }],
      }),
    );

    const parsed = JSON.parse(response.text || '{}') as {
      translations?: Array<{ id?: unknown; text?: unknown }>;
    };
    const validIds = new Set(blockMatches.map((block) => block.id));
    const translations = (Array.isArray(parsed.translations) ? parsed.translations : [])
      .flatMap((item): Array<{ id: string; text: string }> => {
        if (typeof item?.id !== 'string' || !validIds.has(item.id) || typeof item.text !== 'string') {
          return [];
        }
        const text = item.text.trim();
        return text ? [{ id: item.id, text }] : [];
      });

    const metadata = response.usageMetadata;
    const usage = metadata
      ? {
          promptTokens: metadata.promptTokenCount ?? 0,
          candidateTokens: metadata.candidatesTokenCount ?? 0,
          totalTokens: metadata.totalTokenCount ?? 0,
        }
      : null;

    return {
      html: applyBodyBlockTranslations(html, translations),
      usage,
    };
  } catch (err) {
    // As with cover-title QA, keep the completed primary translation if this
    // narrow residue repair is unavailable.
    console.warn('[gemini] Source-language residue verification skipped:', err);
    return { html, usage: null };
  }
}

async function verifyAndRepairTableCells(
  html: string,
  language: string,
  sourceLanguage: string | undefined,
  signal: AbortSignal | undefined,
): Promise<{ html: string; usage: TranslationUsage | null }> {
  if (sourceLanguage?.trim().toLowerCase() === language.trim().toLowerCase()) {
    return { html, usage: null };
  }

  const cellMatches = findTextualTableCellMatches(html);
  if (cellMatches.length === 0) return { html, usage: null };

  try {
    const response = await withRetry(() =>
      getAI().models.generateContent({
        model: TITLE_REPAIR_MODEL,
        config: {
          abortSignal: signal,
          systemInstruction: createTableCellRepairSystemInstruction(language, sourceLanguage),
          temperature: 0,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: titleRepairSchema,
        },
        contents: [{
          parts: [{
            text: JSON.stringify({
              targetLanguage: language,
              cells: cellMatches.map(({ id, currentText }) => ({ id, currentText })),
            }),
          }],
        }],
      }),
    );

    const parsed = JSON.parse(response.text || '{}') as {
      translations?: Array<{ id?: unknown; text?: unknown }>;
    };
    const validIds = new Set(cellMatches.map((cell) => cell.id));
    const translations = (Array.isArray(parsed.translations) ? parsed.translations : [])
      .flatMap((item): Array<{ id: string; text: string }> => {
        if (typeof item?.id !== 'string' || !validIds.has(item.id) || typeof item.text !== 'string') {
          return [];
        }
        const text = item.text.trim();
        return text ? [{ id: item.id, text }] : [];
      });

    const metadata = response.usageMetadata;
    const usage = metadata
      ? {
          promptTokens: metadata.promptTokenCount ?? 0,
          candidateTokens: metadata.candidatesTokenCount ?? 0,
          totalTokens: metadata.totalTokenCount ?? 0,
        }
      : null;

    return {
      html: applyTableCellTranslations(html, translations),
      usage,
    };
  } catch (err) {
    console.warn('[gemini] Table-cell localization verification skipped:', err);
    return { html, usage: null };
  }
}

function isDanishLanguage(language: string | undefined): boolean {
  const normalized = language?.trim().toLocaleLowerCase();
  return normalized === 'danish' || normalized === 'da' || normalized === 'dk';
}

async function verifyAndRepairDanishTranslation(
  html: string,
  language: string,
  sourceLanguage: string | undefined,
  signal: AbortSignal | undefined,
): Promise<{ html: string; usage: TranslationUsage | null }> {
  if (!isDanishLanguage(language) || isDanishLanguage(sourceLanguage)) return { html, usage: null };

  const blocks = extractDanishQaBlocks(html);
  if (blocks.length === 0) return { html, usage: null };

  try {
    const response = await withRetry(() =>
      getAI().models.generateContent({
        model: TITLE_REPAIR_MODEL,
        config: {
          abortSignal: signal,
          systemInstruction: createDanishQaSystemInstruction(sourceLanguage),
          temperature: 0,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: danishQaRepairSchema,
        },
        contents: [{
          parts: [{
            text: JSON.stringify({ targetLanguage: 'Danish', blocks }),
          }],
        }],
      }),
    );

    const parsed = JSON.parse(response.text || '{}') as {
      repairs?: Array<{ id?: unknown; text?: unknown; remove?: unknown }>;
    };
    const validIds = new Set(blocks.map((block) => block.id));
    const repairs = (Array.isArray(parsed.repairs) ? parsed.repairs : [])
      .flatMap((item): Array<{ id: string; text: string; remove: boolean }> => {
        if (
          typeof item?.id !== 'string'
          || !validIds.has(item.id)
          || typeof item.text !== 'string'
          || typeof item.remove !== 'boolean'
        ) {
          return [];
        }
        return [{ id: item.id, text: item.text, remove: item.remove }];
      });

    const metadata = response.usageMetadata;
    const usage = metadata
      ? {
          promptTokens: metadata.promptTokenCount ?? 0,
          candidateTokens: metadata.candidatesTokenCount ?? 0,
          totalTokens: metadata.totalTokenCount ?? 0,
        }
      : null;

    return { html: applyDanishQaRepairs(html, blocks, repairs), usage };
  } catch (err) {
    console.warn('[gemini] Danish terminology QA skipped:', err);
    return { html, usage: null };
  }
}

function reviewedLanguage(language: string): 'spanish' | 'french' | null {
  const normalized = language.trim().toLocaleLowerCase();
  if (normalized === 'spanish' || normalized === 'es') return 'spanish';
  if (normalized === 'french' || normalized === 'fr') return 'french';
  return null;
}

function finalizeTranslatedHtml(
  html: string,
  language: string,
): { html: string; reviewWarnings: TranslationTopologyWarning[] } {
  let finalized = sanitizeMarkdownArtifactsInHtml(html);
  if (reviewedLanguage(language) === 'spanish') {
    finalized = normalizeSpanishMeasurementsInHtml(finalized);
  }
  const artifacts = findMarkdownArtifacts(finalized);
  return {
    html: finalized,
    reviewWarnings: artifacts.map((artifact) => ({
      code: 'LANGUAGE_QA_REVIEW' as const,
      message: `A Markdown artifact (${artifact}) remains and needs manual review.`,
    })),
  };
}

async function verifyAndRepairReviewedTranslation(
  html: string,
  language: string,
  sourceLanguage: string | undefined,
  signal: AbortSignal | undefined,
  translationMemory: TranslatePatternOptions['translationMemory'] = [],
): Promise<{
  html: string;
  usage: TranslationUsage | null;
  reviewWarnings: TranslationTopologyWarning[];
}> {
  const profile = reviewedLanguage(language);
  if (!profile || reviewedLanguage(sourceLanguage ?? '') === profile) {
    return { html, usage: null, reviewWarnings: [] };
  }

  const blocks = extractDanishQaBlocks(html);
  if (blocks.length === 0) return { html, usage: null, reviewWarnings: [] };
  const systemInstruction = profile === 'spanish'
    ? createSpanishQaSystemInstruction(sourceLanguage)
    : createFrenchQaSystemInstruction(sourceLanguage);
  const translationMemoryInstruction = createTranslationMemoryInstruction(translationMemory);

  try {
    const response = await withRetry(() =>
      getAI().models.generateContent({
        model: TITLE_REPAIR_MODEL,
        config: {
          abortSignal: signal,
          systemInstruction,
          temperature: 0,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: localizedQaRepairSchema,
        },
        contents: [{
          parts: [{
            text: `${translationMemoryInstruction ? `${translationMemoryInstruction}\n\n` : ''}${JSON.stringify({ targetLanguage: language, blocks })}`,
          }],
        }],
      }),
    );

    const parsed = JSON.parse(response.text || '{}') as {
      repairs?: Array<{ id?: unknown; text?: unknown; remove?: unknown }>;
      manualReview?: Array<{ id?: unknown; reason?: unknown }>;
    };
    const validIds = new Set(blocks.map((block) => block.id));
    const repairs = (Array.isArray(parsed.repairs) ? parsed.repairs : [])
      .flatMap((item): Array<{ id: string; text: string; remove: boolean }> => {
        if (
          typeof item?.id !== 'string'
          || !validIds.has(item.id)
          || typeof item.text !== 'string'
          || typeof item.remove !== 'boolean'
        ) return [];
        return [{ id: item.id, text: item.text, remove: item.remove }];
      });
    const reviewWarnings = (Array.isArray(parsed.manualReview) ? parsed.manualReview : [])
      .flatMap((item): TranslationTopologyWarning[] => {
        if (
          typeof item?.id !== 'string'
          || !validIds.has(item.id)
          || typeof item.reason !== 'string'
          || !item.reason.trim()
        ) return [];
        return [{
          code: 'LANGUAGE_QA_REVIEW',
          sourceId: item.id,
          message: item.reason.trim().slice(0, 500),
        }];
      });
    const repairedHtml = profile === 'spanish'
      ? applySpanishQaRepairs(html, blocks, repairs)
      : applyFrenchQaRepairs(html, blocks, repairs);

    const metadata = response.usageMetadata;
    const usage = metadata
      ? {
          promptTokens: metadata.promptTokenCount ?? 0,
          candidateTokens: metadata.candidatesTokenCount ?? 0,
          totalTokens: metadata.totalTokenCount ?? 0,
        }
      : null;
    return { html: repairedHtml, usage, reviewWarnings };
  } catch (err) {
    console.warn(`[gemini] ${profile} terminology QA skipped:`, err);
    return { html, usage: null, reviewWarnings: [] };
  }
}

async function verifyAndRepairInlineEmphasis(
  html: string,
  hints: InlineEmphasisHint[],
  language: string,
  sourceLanguage: string | undefined,
  signal: AbortSignal | undefined,
): Promise<{ html: string; usage: TranslationUsage | null }> {
  const candidates = extractInlineEmphasisCandidates(html, hints);
  if (candidates.length === 0) return { html, usage: null };

  try {
    const response = await withRetry(() =>
      getAI().models.generateContent({
        model: TITLE_REPAIR_MODEL,
        config: {
          abortSignal: signal,
          systemInstruction: createInlineEmphasisRepairSystemInstruction(language, sourceLanguage),
          temperature: 0,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: inlineEmphasisRepairSchema,
        },
        contents: [{
          parts: [{
            text: JSON.stringify({ targetLanguage: language, blocks: candidates }),
          }],
        }],
      }),
    );

    const parsed = JSON.parse(response.text || '{}') as {
      repairs?: Array<{ id?: unknown; boldTexts?: unknown }>;
    };
    const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    const repairs = (Array.isArray(parsed.repairs) ? parsed.repairs : [])
      .flatMap((item): Array<{ id: string; boldTexts: string[] }> => {
        if (typeof item?.id !== 'string' || !Array.isArray(item.boldTexts)) return [];
        const candidate = candidatesById.get(item.id);
        if (!candidate) return [];
        const boldTexts = item.boldTexts
          .filter((text): text is string => typeof text === 'string')
          .map((text) => text.trim())
          .filter((text) => text.length > 0 && candidate.currentText.includes(text));
        return [{ id: item.id, boldTexts }];
      });

    const metadata = response.usageMetadata;
    const usage = metadata
      ? {
          promptTokens: metadata.promptTokenCount ?? 0,
          candidateTokens: metadata.candidatesTokenCount ?? 0,
          totalTokens: metadata.totalTokenCount ?? 0,
        }
      : null;

    return { html: applyInlineEmphasisRepairs(html, hints, repairs), usage };
  } catch (err) {
    console.warn('[gemini] Inline-emphasis verification skipped:', err);
    return { html, usage: null };
  }
}

export interface TranslatePatternOptions {
  /**
   * Called for every text delta received from Gemini's streaming response.
   * Use this to forward progress to a downstream client (e.g. NDJSON over HTTP).
   * The text contains raw model output; image markers like `[IMG_5]` are NOT
   * yet replaced. The fully marker-replaced HTML is the resolved `html` value.
   */
  onDelta?: (text: string) => void;
  /** Approved, account-scoped human corrections for this language pair. */
  translationMemory?: Array<{
    sourceLanguage: string;
    targetLanguage: string;
    sourceText: string;
    targetText: string;
  }>;
}

export function createTranslationMemoryInstruction(
  entries: NonNullable<TranslatePatternOptions['translationMemory']> = [],
): string {
  if (entries.length === 0) return '';
  const examples = entries.map((entry, index) => JSON.stringify({
    id: index + 1,
    sourceLanguage: entry.sourceLanguage,
    targetLanguage: entry.targetLanguage,
    source: entry.sourceText,
    approvedTranslation: entry.targetText,
  })).join('\n');
  return `--- APPROVED USER TRANSLATION MEMORY ---
The following pairs are human-approved corrections belonging to this user. Treat them as authoritative examples only when the source phrase and knitting context match. Reuse the approved terminology and phrasing; do not copy unrelated numbers, sizes, row references, or surrounding text into another segment. These examples never override exact source values or document structure.
${examples}
--- END APPROVED USER TRANSLATION MEMORY ---`;
}

async function translatePdf(
  fileBuffer: Buffer,
  mimeType: string,
  language: string,
  sourceLanguage?: string,
  options: TranslatePatternOptions = {},
  signal?: AbortSignal,
): Promise<{ html: string; usage: TranslationUsage | null; reviewWarnings: TranslationTopologyWarning[] }> {
  const base64Data = fileBuffer.toString('base64');
  const systemInstruction = createSystemInstruction(language, sourceLanguage);

  const [images, typographyHints, pageArtifacts] = await Promise.all([
    extractImages(fileBuffer),
    extractTypographyHints(fileBuffer),
    detectPdfPageArtifacts(fileBuffer),
  ]);
  const catalog = buildImageCatalog(images);
  const typographyCatalog = buildTypographyCatalog(typographyHints);
  const emphasisHints: InlineEmphasisHint[] = typographyHints.emphasisHints.map(
    ({ originalText, boldTexts }) => ({ originalText, boldTexts }),
  );
  const artifactInstruction = buildPdfPageArtifactInstruction(pageArtifacts);

  const sourcePromptClause = sourceLanguage
    ? `The pattern is in ${sourceLanguage}. Translate`
    : 'Detect the source language and translate';

  const catalogInstruction = catalog
    ? `The following images were extracted from this PDF. Place each marker at the corresponding position in your HTML output.\n${catalog}`
    : '';
  const translationMemoryInstruction = createTranslationMemoryInstruction(options.translationMemory);
  const typographyInstruction = typographyCatalog
    ? `The following typography hints were extracted from this PDF. Preserve their heading hierarchy, font family, and relative scale in your translated HTML.\n${typographyCatalog}`
    : '';

  // Streaming so the response headers arrive almost immediately. Otherwise large patterns
  // can take longer to generate than undici's default 5-minute headersTimeout, producing
  // `TypeError: fetch failed` / `UND_ERR_HEADERS_TIMEOUT` from the underlying Node fetch.
  const { html: rawHtml, usage } = await withRetry(async () => {
    const stream = await getAI().models.generateContentStream({
      model: TRANSLATION_MODEL,
      config: {
        abortSignal: signal,
        systemInstruction,
        temperature: 0.1,
        thinkingConfig: TRANSLATION_THINKING_CONFIG,
      },
      contents: [
        {
          parts: [
            {
              text: `${sourcePromptClause} and visually reconstruct this knitting pattern into ${language}. Translate every title, subtitle, and section heading into ${language}, including visible heading words embedded in decorative images or stylized graphics; preserve only genuine proper names or brand names. Pay special attention to TABLES and STITCH CHARTS; convert all of them into HTML <table> structures. Preserve the source pattern's exact multi-size formatting, including each size list's parentheses, commas, spacing, and bold/plain size markers. Ensure every technical term is correctly localized and all source language text is removed. Return raw HTML.`,
            },
            ...(catalogInstruction ? [{ text: catalogInstruction }] : []),
            ...(typographyInstruction ? [{ text: typographyInstruction }] : []),
            ...(artifactInstruction ? [{ text: artifactInstruction }] : []),
            ...(translationMemoryInstruction ? [{ text: translationMemoryInstruction }] : []),
            {
              text: 'Remember: for stitch-chart legends (including LEGEND SYMBOL / LEGEND CANDIDATES, and also text-only symbol keys), you MUST rebuild a 2-column <table>: column 1 = original symbol ([IMG_N] bare in <td>, or the drawn glyph if no image); column 2 = ONLY the TRANSLATED meaning. NEVER leave English abbreviations like k2tog, ssk, CDD, knit, yarn over untranslated. Legend symbols override ROW groups — never put them in [ROW_N] or <p>[IMG_N]</p>. For other side-by-side photo rows, use [ROW_N] once instead of individual members. Never emit raw <img> tags.',
            },
            {
              inlineData: { data: base64Data, mimeType },
            },
          ],
        },
      ],
    });

    let aggregatedHtml = '';
    let lastUsage: TranslationUsage | null = null;
    for await (const chunk of stream) {
      const delta = chunk.text;
      if (typeof delta === 'string' && delta.length > 0) {
        aggregatedHtml += delta;
        if (options.onDelta) {
          try {
            options.onDelta(delta);
          } catch (cbErr) {
            console.warn('[gemini] onDelta callback threw:', cbErr);
          }
        }
      }
      if (chunk.usageMetadata) {
        lastUsage = {
          promptTokens: chunk.usageMetadata.promptTokenCount ?? 0,
          candidateTokens: chunk.usageMetadata.candidatesTokenCount ?? 0,
          totalTokens: chunk.usageMetadata.totalTokenCount ?? 0,
        };
      }
    }

    return { html: aggregatedHtml, usage: lastUsage };
  });

  const repairedCover = await verifyAndRepairCoverHeadings(
    rawHtml,
    language,
    sourceLanguage,
    signal,
  );
  const withoutPageArtifacts = removePdfPageArtifacts(repairedCover.html, pageArtifacts);
  const repairedBody = await verifyAndRepairUntranslatedBlocks(
    withoutPageArtifacts,
    language,
    sourceLanguage,
    signal,
  );
  const repairedTables = await verifyAndRepairTableCells(
    repairedBody.html,
    language,
    sourceLanguage,
    signal,
  );
  const repairedDanish = await verifyAndRepairDanishTranslation(
    repairedTables.html,
    language,
    sourceLanguage,
    signal,
  );
  const repairedReviewedLanguage = await verifyAndRepairReviewedTranslation(
    repairedDanish.html,
    language,
    sourceLanguage,
    signal,
    options.translationMemory,
  );
  const repairedEmphasis = await verifyAndRepairInlineEmphasis(
    repairedReviewedLanguage.html,
    emphasisHints,
    language,
    sourceLanguage,
    signal,
  );
  const finalized = finalizeTranslatedHtml(replaceImageMarkers(repairedEmphasis.html, images), language);

  return {
    html: finalized.html,
    reviewWarnings: [...repairedReviewedLanguage.reviewWarnings, ...finalized.reviewWarnings],
    usage: mergeTranslationUsage(
      mergeTranslationUsage(
        mergeTranslationUsage(usage, repairedCover.usage),
        repairedBody.usage,
      ),
      mergeTranslationUsage(
        mergeTranslationUsage(
          mergeTranslationUsage(repairedTables.usage, repairedDanish.usage),
          repairedReviewedLanguage.usage,
        ),
        repairedEmphasis.usage,
      ),
    ),
  };
}

export const createDocumentSystemInstruction = (language: string, sourceLanguage?: string) => {
  const specificRules = getLanguageSpecificRules(language);
  const sourceClause = sourceLanguage
    ? `The source pattern is written in ${sourceLanguage}. `
    : 'Auto-detect the source language of the pattern. ';

  return `You are a world-class senior knitting pattern translator and technical document designer. ${sourceClause}You will be given a knitting pattern as HTML that was extracted from a Word/RTF/plain-text document. Translate it into ${language} with extreme technical precision while faithfully preserving the document's structure.

### 1. STRUCTURE PRESERVATION (CRITICAL):
- Preserve ALL existing structure: headings, paragraphs, ordered/unordered lists, and especially <table> elements. Keep every row and column of every table intact.
- Do NOT drop, summarize, merge, or skip any content. Every instruction, note, table, and chart that exists in the source must exist in your output.
- Every incoming data-source-id is immutable. Return exactly one element with the same tag and id for every source element, in the same order. Translate only the text inside it; never create, delete, merge, split, reorder, or retag elements.
- Preserve intentional empty paragraphs, every manual <br>, explicit page-break style, list type and nesting level, and each table-cell boundary exactly. If wording is difficult, keep the element and translate conservatively rather than restructuring it.
- If the source uses tables for measurement/stitch-count data or stitch charts, keep them as HTML <table> structures.
- Translate every human-language <th> and <td>, including table headings, garment-part labels, and written size/age labels such as "Size", "Chest circumference", "Newborn", "months", and "years". Table text is not international terminology.
- Preserve numeric measurements, decimal separators, units, symbols, parentheses, dashes, row/column order, and size order exactly as supplied; translate only the surrounding words.

### 2. IMAGES (STRICT):
- The source HTML may contain bracketed markers like [IMG_1], [IMG_2] that stand in for images. Keep EVERY marker exactly where it appears, with the SAME number.
- Do NOT remove, reorder, duplicate, renumber, or invent markers. Do NOT emit <img> tags or any image data — only the [IMG_n] markers. The server re-inserts the real images afterward.

${createSizeFormatPreservationRules(3)}

${createTitleTranslationRules(4, language)}

### 5. LANGUAGE & TECHNICAL RULES:
- **NO SOURCE LANGUAGE**: Remove source-language text and abbreviations except tokens explicitly preserved by the language-specific rules. The output must be fully ${language}.
- **100% LOCALIZED**: Use the specific localized abbreviations for ${language}, including any explicit preserve/rename exceptions in the language-specific rules.
- **PUNCTUATION**: Maintain the exact punctuation (brackets, colons, slashes) used in the original for sizing.
- **INLINE BOLD IS SOURCE DATA**: Preserve every source <strong>/<b> fragment in its translated equivalent. In glossary entries, keep the abbreviation/prefix bold when it is bold in the source. In size lists, keep exactly the same size slots bold and do not infer a different pattern.

### 6. OUTPUT FORMAT:
- Output raw semantic HTML5 wrapped in a single <div>. DO NOT use markdown code blocks (\`\`\`html).
- Never emit literal Markdown emphasis or heading syntax such as **, __, backticks, or # headings. Use native <strong>/<em> only for the equivalent source text range.
- Use real semantic headings: <h1> for the pattern title, <h2> for major sections (Materials, Gauge, Abbreviations, Pattern, Finishing, etc.), <h3> for sub-sections, <h4> for sub-sub-sections.
- THERE MUST BE EXACTLY ONE <h1> (the pattern title). Never promote ordinary section headings to <h1>; major sections are always <h2>.
- Use <strong> ONLY where the source uses bold for inline emphasis or size markers, and for true inline emphasis in translated text — never as a section header.
- For tables, use <table style="width: 100%; border-collapse: collapse; margin: 1em 0; border: 1px solid #ccc;"> with padded cells.

### 7. BILINGUAL ALIGNMENT (CRITICAL):
- On EVERY block-level text element you output — specifically <h1>, <h2>, <h3>, <h4>, <p>, and <li> — add TWO attributes:
  1. data-seg="N": a sequential integer starting at 1 and increasing by exactly 1 for each such block in document order. Never skip or repeat a number.
  2. data-o="...": the ORIGINAL, UNTRANSLATED source-language text of that exact block, as PLAIN TEXT (no HTML tags inside). HTML-escape it by replacing & with &amp;, " with &quot;, < with &lt;, and > with &gt;.
- The data-o text must correspond 1:1 to the translated content of the SAME element, so a reader can see which source sentence produced which translation.
- On every textual <th> and <td>, add data-o="..." containing that cell's original plain text, but no data-seg. This lets terminology QA compare table and chart-legend abbreviations with the source.
- Do NOT add data-seg or data-o to <img>, <table>, <thead>, <tbody>, or <tr> elements, or to image marker paragraphs such as <p>[IMG_1]</p>.
- Example: <p data-seg="4" data-o="Cast on 20 (24, 28) stitches.">Monta 20 (24, 28) puntos.</p>

${specificRules}

The priority is a complete, high-fidelity, fully-${language} reconstruction with all structure and tables preserved.`;
};

// Pulls <img> tags out of source HTML, replacing each with a sequential
// [IMG_n] marker, and returns the marker-ified HTML plus the ordered list of
// original `src` values. This keeps token-heavy base64 data URIs out of the
// model request and protects images from being altered during translation.
function protectImages(html: string): { marked: string; srcs: string[] } {
  const srcs: string[] = [];
  const marked = html.replace(/<img\b[^>]*>/gi, (tag) => {
    const match = tag.match(/\bsrc\s*=\s*"([^"]*)"/i) || tag.match(/\bsrc\s*=\s*'([^']*)'/i);
    const src = match ? match[1] : '';
    if (!src) return '';
    srcs.push(src);
    return `<p>[IMG_${srcs.length}]</p>`;
  });
  return { marked, srcs };
}

function reinsertImages(html: string, srcs: string[]): string {
  const render = (n: number): string => {
    const src = srcs[n - 1];
    if (!src) return '';
    return `<img src="${src}" style="display:block;max-width:100%;height:auto;margin:1em auto;" alt="IMG_${n}" />`;
  };

  return html
    .replace(/<code>\s*(\[\s*IMG[_\s-]?\d+\s*\])\s*<\/code>/gi, '$1')
    .replace(/<p>\s*\[\s*IMG[_\s-]?(\d+)\s*\]\s*<\/p>/gi, (_m, n) => render(Number(n)))
    .replace(/\[\s*IMG[_\s-]?(\d+)\s*\]/gi, (_m, n) => render(Number(n)));
}

async function translateDocumentHtml(
  sourceHtml: string,
  language: string,
  sourceLanguage?: string,
  options: TranslatePatternOptions = {},
  signal?: AbortSignal,
): Promise<{ html: string; usage: TranslationUsage | null; reviewWarnings: TranslationTopologyWarning[] }> {
  const { marked, srcs } = protectImages(sourceHtml);
  const annotatedSource = annotateSourceTopology(marked);
  const emphasisHints = extractSourceInlineEmphasisHints(annotatedSource);
  const systemInstruction = createDocumentSystemInstruction(language, sourceLanguage);

  const sourcePromptClause = sourceLanguage
    ? `The pattern is in ${sourceLanguage}. Translate`
    : 'Detect the source language and translate';
  const translationMemoryInstruction = createTranslationMemoryInstruction(options.translationMemory);

  const { html: rawHtml, usage } = await withRetry(async () => {
    const stream = await getAI().models.generateContentStream({
      model: TRANSLATION_MODEL,
      config: {
        abortSignal: signal,
        systemInstruction,
        temperature: 0.1,
        thinkingConfig: TRANSLATION_THINKING_CONFIG,
      },
      contents: [
        {
          parts: [
            {
              text: `${sourcePromptClause} and faithfully reconstruct the following knitting pattern into ${language}. The pattern is provided as HTML extracted from a word-processor document. Translate every title and subtitle descriptor into ${language}; preserve only genuine proper names or brand names. Preserve all structure and TABLES, keep every [IMG_n] marker exactly in place, preserve the source pattern's exact multi-size formatting including each size list's parentheses, commas, spacing, and bold/plain size markers, localize every technical term, and remove all source-language text. Every data-source-id is immutable: translate only inside its existing element and never create, delete, merge, split, reorder, or retag source elements. Preserve empty paragraphs, <br> tags, page-break styles, list nesting, and table-cell boundaries exactly. Return raw HTML.\n\n${translationMemoryInstruction ? `${translationMemoryInstruction}\n\n` : ''}--- SOURCE PATTERN (HTML) ---\n${annotatedSource}\n--- END SOURCE PATTERN ---`,
            },
          ],
        },
      ],
    });

    let aggregatedHtml = '';
    let lastUsage: TranslationUsage | null = null;
    for await (const chunk of stream) {
      const delta = chunk.text;
      if (typeof delta === 'string' && delta.length > 0) {
        aggregatedHtml += delta;
        if (options.onDelta) {
          try {
            options.onDelta(delta);
          } catch (cbErr) {
            console.warn('[gemini] onDelta callback threw:', cbErr);
          }
        }
      }
      if (chunk.usageMetadata) {
        lastUsage = {
          promptTokens: chunk.usageMetadata.promptTokenCount ?? 0,
          candidateTokens: chunk.usageMetadata.candidatesTokenCount ?? 0,
          totalTokens: chunk.usageMetadata.totalTokenCount ?? 0,
        };
      }
    }

    return { html: aggregatedHtml, usage: lastUsage };
  });

  const repairedCover = await verifyAndRepairCoverHeadings(
    rawHtml,
    language,
    sourceLanguage,
    signal,
  );
  const repairedBody = await verifyAndRepairUntranslatedBlocks(
    repairedCover.html,
    language,
    sourceLanguage,
    signal,
  );
  const repairedTables = await verifyAndRepairTableCells(
    repairedBody.html,
    language,
    sourceLanguage,
    signal,
  );
  const repairedDanish = await verifyAndRepairDanishTranslation(
    repairedTables.html,
    language,
    sourceLanguage,
    signal,
  );
  const repairedReviewedLanguage = await verifyAndRepairReviewedTranslation(
    repairedDanish.html,
    language,
    sourceLanguage,
    signal,
    options.translationMemory,
  );
  const repairedEmphasis = await verifyAndRepairInlineEmphasis(
    repairedReviewedLanguage.html,
    emphasisHints,
    language,
    sourceLanguage,
    signal,
  );
  const finalized = finalizeTranslatedHtml(reinsertImages(repairedEmphasis.html, srcs), language);
  const topologyWarnings = auditTranslatedTopology(annotatedSource, finalized.html);
  return {
    html: finalized.html,
    reviewWarnings: [
      ...topologyWarnings,
      ...repairedReviewedLanguage.reviewWarnings,
      ...finalized.reviewWarnings,
    ],
    usage: mergeTranslationUsage(
      mergeTranslationUsage(
        mergeTranslationUsage(usage, repairedCover.usage),
        repairedBody.usage,
      ),
      mergeTranslationUsage(
        mergeTranslationUsage(
          mergeTranslationUsage(repairedTables.usage, repairedDanish.usage),
          repairedReviewedLanguage.usage,
        ),
        repairedEmphasis.usage,
      ),
    ),
  };
}

/**
 * Translate a pattern from any supported source file. PDFs use the multimodal
 * visual-reconstruction pipeline; Word (.docx), RTF, and plain-text files are
 * converted to HTML and translated via a text-based pass.
 */
export async function translatePattern(
  fileBuffer: Buffer,
  mimeType: string,
  language: string,
  sourceLanguage?: string,
  options: TranslatePatternOptions = {},
  fileName?: string,
): Promise<{
  html: string;
  usage: TranslationUsage | null;
  reviewWarnings: TranslationTopologyWarning[];
}> {
  const kind = detectSourceKind(fileBuffer, mimeType, fileName);

  if (kind === 'pdf') {
    return withExternalDeadline('Gemini translation', TRANSLATION_DEADLINE_MS, (signal) =>
      translatePdf(fileBuffer, mimeType, language, sourceLanguage, options, signal),
    );
  }

  const sourceHtml = await extractDocumentHtml(fileBuffer, kind);
  if (!sourceHtml.replace(/<[^>]+>/g, '').trim()) {
    throw new Error(
      'Could not read any text from this document. Please try exporting it as a PDF.',
    );
  }

  return withExternalDeadline('Gemini translation', TRANSLATION_DEADLINE_MS, (signal) =>
    translateDocumentHtml(sourceHtml, language, sourceLanguage, options, signal),
  );
}

// --- Chat session management ---

interface ChatSession {
  chat: Chat;
  createdAt: number;
  ownerSub: string;
  patternId: string;
}

const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour
const chatSessions = new Map<string, ChatSession>();

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of chatSessions) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      chatSessions.delete(id);
    }
  }
}, 5 * 60 * 1000);

export interface PriorChatMessage {
  role: 'user' | 'model';
  content: string;
}

export async function createChatSession(
  patternHtml: string,
  priorMessages: PriorChatMessage[] = [],
  ownerSub: string,
  patternId: string,
): Promise<string> {
  const sessionId = crypto.randomUUID();

  const baseHistory = [
    {
      role: 'user' as const,
      parts: [
        {
          text: `Here is the knitting pattern I need help with (in HTML format):\n\n---PATTERN START---\n\n${patternHtml}\n\n---PATTERN END---\n\nPlease act as my knitting assistant for this pattern.`,
        },
      ],
    },
    {
      role: 'model' as const,
      parts: [
        {
          text: "Of course! I've reviewed the pattern and I'm ready to help. What's your first question?",
        },
      ],
    },
  ];

  const replayedHistory = priorMessages
    .filter((m) => typeof m.content === 'string' && m.content.trim().length > 0)
    .map((m) => ({
      role: m.role,
      parts: [{ text: m.content }],
    }));

  const chat = await withRetry(() =>
    getAI().chats.create({
      model: 'gemini-3.5-flash',
      config: {
        systemInstruction: `You are a friendly and expert knitting assistant. All your answers must be based *only* on the knitting pattern provided by the user (which is in HTML format). If a question is not related to the pattern, politely decline to answer. Be helpful and encouraging. Use the correct localized terminology.`,
      },
      history: [...baseHistory, ...replayedHistory],
    }),
  );

  chatSessions.set(sessionId, { chat, createdAt: Date.now(), ownerSub, patternId });
  return sessionId;
}

export function getChatSessionPatternId(sessionId: string, requesterSub: string): string | null {
  const session = chatSessions.get(sessionId);
  return session?.ownerSub === requesterSub ? session.patternId : null;
}

export async function sendChatMessage(
  sessionId: string,
  message: string,
  requesterSub: string,
): Promise<string> {
  const session = chatSessions.get(sessionId);
  // Treat a session owned by someone else as "not found" so a leaked sessionId
  // can't be used to read into another user's pattern-seeded chat.
  if (!session || session.ownerSub !== requesterSub) {
    throw new Error('Chat session not found or expired.');
  }

  session.createdAt = Date.now();
  const response = await withExternalDeadline('Gemini chat', CHAT_DEADLINE_MS, (signal) =>
    withRetry(() => session.chat.sendMessage({ message, config: { abortSignal: signal } })),
  );
  return response.text || '';
}

// --- Glossary term lookup ---

export interface GlossaryTermResult {
  sourceAbbreviation: string;
  sourceFull: string;
  targetAbbreviation: string;
  targetFull: string;
  explanation: string;
}

export async function glossaryLookup(
  term: string,
  sourceLang: string,
  targetLang: string,
): Promise<GlossaryTermResult> {
  const targetLanguageRules = getLanguageSpecificRules(targetLang);
  const prompt = `You are a multilingual knitting and crochet terminology expert.

Translate the following knitting/crochet term from ${sourceLang} to ${targetLang}.

${targetLanguageRules}

Term: "${term}"

Respond ONLY with valid JSON (no markdown fences):
{
  "sourceAbbreviation": "abbreviation in ${sourceLang} if one exists, or empty string",
  "sourceFull": "full term in ${sourceLang}",
  "targetAbbreviation": "abbreviation in ${targetLang} if one exists, or empty string",
  "targetFull": "full term in ${targetLang}",
  "explanation": "A brief (1-2 sentence) explanation of this term in context of knitting/crochet"
}`;

  const response = await withExternalDeadline('Gemini glossary', GLOSSARY_DEADLINE_MS, (signal) =>
    withRetry(() => getAI().models.generateContent({
      model: 'gemini-2.0-flash',
      config: { temperature: 0.2, maxOutputTokens: 300, abortSignal: signal },
      contents: [{ parts: [{ text: prompt }] }],
    })),
  );

  const text = response.text || '';
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  try {
    return JSON.parse(cleaned) as GlossaryTermResult;
  } catch {
    throw new Error('Could not parse the lookup response. Please try a different term.');
  }
}
