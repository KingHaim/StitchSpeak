import { GoogleGenAI, ThinkingLevel, type Chat } from '@google/genai';
import crypto from 'node:crypto';
import { extractImages, buildImageCatalog, replaceImageMarkers } from './pdfImages.js';
import { extractTypographyHints, buildTypographyCatalog } from './pdfTypography.js';
import {
  buildPdfPageArtifactInstruction,
  detectPdfPageArtifacts,
  removePdfPageArtifacts,
} from './pdfPageArtifacts.js';
import { detectSourceKind, extractDocumentHtml } from './documentExtract.js';
import { withExternalDeadline } from './externalDeadline.js';

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
    - slip slip knit (SSK) -> ddD (deslizar, deslizar, derecho)
    - knit 2 together (k2tog) -> 2pjD (2 puntos juntos derecho)
    - yarn over (yo) -> H (hebra)
    - Sweater -> Jersey (NEVER use "suéter" or "sweater")
    - LH needle -> Ag-i (Aguja izquierda)
    - RH needle -> Ag-d (Aguja derecha)
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

export const createSystemInstruction = (language: string, sourceLanguage?: string) => {
  const specificRules = getLanguageSpecificRules(language);

  const sourceClause = sourceLanguage
    ? `The source pattern is written in ${sourceLanguage}. `
    : 'Auto-detect the source language of the pattern. ';

  return `You are a world-class senior knitting pattern translator and technical document designer. ${sourceClause}Your goal is to translate patterns into ${language} with extreme technical precision, reconstructing every visual element including tables and charts.

### 1. TABLE & CHART RECONSTRUCTION (CRITICAL):
- **TABLES**: If you see rows/columns of data (e.g., measurement tables or stitch count tables), you MUST reconstruct them using HTML <table>, <thead>, <tbody>, <tr>, and <td> tags. Add a border="1" attribute or use styles to ensure they are visible.
- **STITCH CHARTS**: If the PDF contains a grid/chart representing a stitch pattern, you MUST reconstruct it as an HTML table. Each cell in the table should represent one square of the chart. Translate any symbols in the chart legend accurately.
- **NO SKIPPING**: Do not summarize tables or skip charts. Every piece of technical data in the PDF must be present in the HTML output.

### 1b. STITCH CHART LEGENDS (CRITICAL):
A "chart legend" (a.k.a. symbol key / leyenda de símbolos) is the small key, usually adjacent to or below a stitch chart, where each row pairs a tiny symbol image (a square or rectangle showing one stitch icon) with a short text description of what that symbol means.

Whenever you detect this pattern in the source — i.e. an image catalog item that is a small, square-ish, low-aspect-ratio symbol image accompanied by a short stitch description in the surrounding text — you MUST reconstruct the legend as a dedicated HTML <table> with EXACTLY 2 columns and one row per legend entry:
  1. **First column (the symbol)**: contains ONLY the bare \`[IMG_N]\` marker for that symbol image (no <p> wrapper, no caption, no translation, no extra text). The original image must be preserved AS-IS — do NOT try to translate or describe it inside the cell.
  2. **Second column (the meaning)**: contains ONLY the TRANSLATED ${language} description of that stitch (full term and/or localized abbreviation). Do NOT keep any source-language text in this column.

Use this exact table structure for legends:
\`\`\`
<table style="width: auto; border-collapse: collapse; margin: 1em 0; border: 1px solid #ccc;">
  <thead><tr><th style="padding: 0.4em 0.75em; text-align: center;">Símbolo</th><th style="padding: 0.4em 0.75em; text-align: left;">Significado</th></tr></thead>
  <tbody>
    <tr><td style="padding: 0.3em 0.5em; text-align: center; vertical-align: middle; width: 56px;">[IMG_5]</td><td style="padding: 0.3em 0.75em; vertical-align: middle;">Translated description here</td></tr>
    <tr><td style="padding: 0.3em 0.5em; text-align: center; vertical-align: middle; width: 56px;">[IMG_6]</td><td style="padding: 0.3em 0.75em; vertical-align: middle;">Translated description here</td></tr>
  </tbody>
</table>
\`\`\`
The header labels themselves ("Símbolo" / "Significado") must be translated into ${language} (e.g. for English: "Symbol" / "Meaning"; French: "Symbole" / "Signification"; etc.). Each legend symbol image must appear EXACTLY ONCE — inside its legend cell. Do NOT also emit a separate \`<p>[IMG_N]</p>\` block for that same symbol.

${createSizeFormatPreservationRules(2)}

### 3. LANGUAGE & TECHNICAL RULES:
- **NO SOURCE LANGUAGE IN GLOSSARY**: Remove all source-language abbreviations. The glossary must ONLY contain the ${language} abbreviation and its full definition.
- **100% LOCALIZED**: Use the specific localized abbreviations for ${language} (e.g., MO, Rem, h, 2pjd).
- **PUNCTUATION**: Maintain the exact punctuation (brackets, colons, slashes) used in the original for sizing.

### 4. OUTPUT FORMAT:
- Output raw semantic HTML5 wrapped in a single <div>.
- Use real semantic headings: <h1> for the pattern title, <h2> for major sections (Materials, Gauge, Abbreviations, Pattern, Finishing, etc.), <h3> for sub-sections, and <h4> for sub-sub-sections.
- THERE MUST BE EXACTLY ONE <h1> IN THE ENTIRE DOCUMENT: the cover/pattern title. Every major section heading (e.g. Sizes, Materials, Gauge, Glossary, Body, Neck, Finishing, Charts) MUST be <h2> — never <h1> — even if it appears large in the source. Do not promote section headings to <h1> just because their font is big.
- Use <strong> ONLY where the source uses bold for inline emphasis or size markers, and for true inline emphasis in translated text. NEVER use <strong> as a section header.
- For tables, use <table> with styles: "width: 100%; border-collapse: collapse; margin: 10px 0; border: 1px solid #ccc;".
- For table cells, use padding and center-alignment where appropriate.
- DO NOT use markdown code blocks (\`\`\`html).

### 5. IMAGE PLACEMENT (CRITICAL - STRICT FORMAT):
- You may be given a numbered list of images extracted from the PDF (an "IMAGE CATALOG").
- Each image has an ID (e.g. IMG_1), a page number, and a description of where it appeared on the page.
- The catalog may also list "IMAGE ROW GROUPS" with IDs like ROW_1. A row group means those images sat side-by-side on the same horizontal row in the original document.
- Some images may be marked as small top-of-page banners or logos. Those must remain above the page title/heading they precede in the original layout.
- You MUST place each image in the translated HTML at the position corresponding to where it appeared in the original document, preserving the original reading order.
- Markers MUST be one of these exact shapes and nothing else:
    1. <p>[IMG_1]</p>  — for a standalone single image (default block-level placement).
    2. <p>[ROW_1]</p>  — for an entire side-by-side row of images. The server expands this into a horizontal flex container with all member images in left-to-right order.
    3. <td ...>[IMG_1]</td>  — bare marker (no <p> wrapper) inside a stitch-chart-legend table cell. The server detects markers inside <td> and renders the image small/inline so it fits the legend row.
- When a ROW group is listed in the catalog, you MUST use the [ROW_N] marker once and you MUST NOT also emit individual [IMG_N] markers for any of that row's members. Choosing the row marker is REQUIRED whenever it exists.
- Each marker (whether IMG or ROW) may appear at most once. Cover every catalog item exactly once via its row marker, its block <p>[IMG_N]</p> marker, OR its legend <td>[IMG_N]</td> cell — never combine forms for the same image. Logos and small banners are NOT optional and must always be emitted via their [IMG_N] markers in their original document position.
- The marker text MUST match this exact structure: opening "[", literal "IMG_" or "ROW_", the integer ID, closing "]". No spaces, no hyphens, no quotes, no markdown, no <code>, and no raw <img> tags.
- Do NOT invent IDs that are not in the catalog. The server will inject the actual images for every valid marker.
- If no IMAGE CATALOG is provided, ignore this section.

### 6. HEADING STYLING (STANDARD TEXT STYLE):
- A TYPOGRAPHY HINTS list may be provided.
- Pattern text must use the app standard typography: Arial and black. Do NOT emit inline font-family or color styles for any text.
- For each hint, when you emit the equivalent translated heading text, use the suggested tag (h1/h2/h3/h4) and, when useful, add only the suggested size in this exact pattern: style="font-size: <ratio>em;"
- Use the exact tag given in each hint. Never emit an inline font-size larger than 2em for any heading.
- Use the same tag and ratio for translated text whose role or position matches the source heading even if the wording changes during translation.
- Preserve obvious decorative styling from the source heading when it is visually clear, especially centered cover titles, underlines, and title placement directly beneath a small top banner/logo image.
- If no hint matches a section, still choose the correct semantic heading tag from the rules above, but omit the inline style.
- If a BODY font hint is provided, ignore its font family and color; use it only as a guide for structure, spacing, or relative sizing.

### 7. BILINGUAL ALIGNMENT (CRITICAL):
- On EVERY block-level text element you output — specifically <h1>, <h2>, <h3>, <h4>, <p>, and <li> — add TWO attributes:
  1. data-seg="N": a sequential integer starting at 1 and increasing by exactly 1 for each such block in document order. Never skip or repeat a number.
  2. data-o="...": the ORIGINAL, UNTRANSLATED source-language text of that exact block, as PLAIN TEXT (no HTML tags inside). HTML-escape it by replacing & with &amp;, " with &quot;, < with &lt;, and > with &gt;.
- The data-o text must correspond 1:1 to the translated content of the SAME element, so a reader can see which source sentence produced which translation.
- Do NOT add data-seg or data-o to <img> elements, to <table>/<thead>/<tbody>/<tr>/<th>/<td> elements, or to image/row marker paragraphs such as <p>[IMG_1]</p> or <p>[ROW_1]</p>. Only the textual blocks listed above.
- Example: <p data-seg="4" data-o="Cast on 20 (24, 28) stitches.">Monta 20 (24, 28) puntos.</p>

${specificRules}

The priority is a high-fidelity reconstruction. A pattern is useless without its charts and tables. Ensure they are perfectly translated and formatted as HTML tables.`;
};

interface TranslationUsage {
  promptTokens: number;
  candidateTokens: number;
  totalTokens: number;
}

export interface TranslatePatternOptions {
  /**
   * Called for every text delta received from Gemini's streaming response.
   * Use this to forward progress to a downstream client (e.g. NDJSON over HTTP).
   * The text contains raw model output; image markers like `[IMG_5]` are NOT
   * yet replaced. The fully marker-replaced HTML is the resolved `html` value.
   */
  onDelta?: (text: string) => void;
}

async function translatePdf(
  fileBuffer: Buffer,
  mimeType: string,
  language: string,
  sourceLanguage?: string,
  options: TranslatePatternOptions = {},
  signal?: AbortSignal,
): Promise<{ html: string; usage: TranslationUsage | null }> {
  const base64Data = fileBuffer.toString('base64');
  const systemInstruction = createSystemInstruction(language, sourceLanguage);

  const [images, typographyHints, pageArtifacts] = await Promise.all([
    extractImages(fileBuffer),
    extractTypographyHints(fileBuffer),
    detectPdfPageArtifacts(fileBuffer),
  ]);
  const catalog = buildImageCatalog(images);
  const typographyCatalog = buildTypographyCatalog(typographyHints);
  const artifactInstruction = buildPdfPageArtifactInstruction(pageArtifacts);

  const sourcePromptClause = sourceLanguage
    ? `The pattern is in ${sourceLanguage}. Translate`
    : 'Detect the source language and translate';

  const catalogInstruction = catalog
    ? `The following images were extracted from this PDF. Place each marker at the corresponding position in your HTML output.\n${catalog}`
    : '';
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
              text: `${sourcePromptClause} and visually reconstruct this knitting pattern into ${language}. Pay special attention to TABLES and STITCH CHARTS; convert all of them into HTML <table> structures. Preserve the source pattern's exact multi-size formatting, including each size list's parentheses, commas, spacing, and bold/plain size markers. Ensure every technical term is correctly localized and all source language text is removed. Return raw HTML.`,
            },
            ...(catalogInstruction ? [{ text: catalogInstruction }] : []),
            ...(typographyInstruction ? [{ text: typographyInstruction }] : []),
            ...(artifactInstruction ? [{ text: artifactInstruction }] : []),
            {
              text: 'Remember: use the bracketed [ROW_N] marker for any catalog row group (the server will render its images side-by-side), and the [IMG_N] marker only for images that are not part of any row. For stitch-chart legends (small symbol images paired with descriptive text), build a 2-column <table> where column 1 is a <td> containing the bare [IMG_N] marker (no <p>) for the original symbol AS-IS and column 2 is a <td> containing only the TRANSLATED meaning text. Never emit raw <img> tags.',
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

  const withoutPageArtifacts = removePdfPageArtifacts(rawHtml, pageArtifacts);
  const html = replaceImageMarkers(withoutPageArtifacts, images);

  return { html, usage };
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
- If the source uses tables for measurement/stitch-count data or stitch charts, keep them as HTML <table> structures.

### 2. IMAGES (STRICT):
- The source HTML may contain bracketed markers like [IMG_1], [IMG_2] that stand in for images. Keep EVERY marker exactly where it appears, with the SAME number.
- Do NOT remove, reorder, duplicate, renumber, or invent markers. Do NOT emit <img> tags or any image data — only the [IMG_n] markers. The server re-inserts the real images afterward.

${createSizeFormatPreservationRules(3)}

### 4. LANGUAGE & TECHNICAL RULES:
- **NO SOURCE LANGUAGE**: Remove all source-language abbreviations and text. The output must be fully ${language}.
- **100% LOCALIZED**: Use the specific localized abbreviations for ${language}.
- **PUNCTUATION**: Maintain the exact punctuation (brackets, colons, slashes) used in the original for sizing.

### 5. OUTPUT FORMAT:
- Output raw semantic HTML5 wrapped in a single <div>. DO NOT use markdown code blocks (\`\`\`html).
- Use real semantic headings: <h1> for the pattern title, <h2> for major sections (Materials, Gauge, Abbreviations, Pattern, Finishing, etc.), <h3> for sub-sections, <h4> for sub-sub-sections.
- THERE MUST BE EXACTLY ONE <h1> (the pattern title). Never promote ordinary section headings to <h1>; major sections are always <h2>.
- Use <strong> ONLY where the source uses bold for inline emphasis or size markers, and for true inline emphasis in translated text — never as a section header.
- For tables, use <table style="width: 100%; border-collapse: collapse; margin: 1em 0; border: 1px solid #ccc;"> with padded cells.

### 6. BILINGUAL ALIGNMENT (CRITICAL):
- On EVERY block-level text element you output — specifically <h1>, <h2>, <h3>, <h4>, <p>, and <li> — add TWO attributes:
  1. data-seg="N": a sequential integer starting at 1 and increasing by exactly 1 for each such block in document order. Never skip or repeat a number.
  2. data-o="...": the ORIGINAL, UNTRANSLATED source-language text of that exact block, as PLAIN TEXT (no HTML tags inside). HTML-escape it by replacing & with &amp;, " with &quot;, < with &lt;, and > with &gt;.
- The data-o text must correspond 1:1 to the translated content of the SAME element, so a reader can see which source sentence produced which translation.
- Do NOT add data-seg or data-o to <img> elements, to <table>/<thead>/<tbody>/<tr>/<th>/<td> elements, or to image marker paragraphs such as <p>[IMG_1]</p>. Only the textual blocks listed above.
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
): Promise<{ html: string; usage: TranslationUsage | null }> {
  const { marked, srcs } = protectImages(sourceHtml);
  const systemInstruction = createDocumentSystemInstruction(language, sourceLanguage);

  const sourcePromptClause = sourceLanguage
    ? `The pattern is in ${sourceLanguage}. Translate`
    : 'Detect the source language and translate';

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
              text: `${sourcePromptClause} and faithfully reconstruct the following knitting pattern into ${language}. The pattern is provided as HTML extracted from a word-processor document. Preserve all structure and TABLES, keep every [IMG_n] marker exactly in place, preserve the source pattern's exact multi-size formatting including each size list's parentheses, commas, spacing, and bold/plain size markers, localize every technical term, and remove all source-language text. Return raw HTML.\n\n--- SOURCE PATTERN (HTML) ---\n${marked}\n--- END SOURCE PATTERN ---`,
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

  return { html: reinsertImages(rawHtml, srcs), usage };
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
): Promise<{ html: string; usage: TranslationUsage | null }> {
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
  const prompt = `You are a multilingual knitting and crochet terminology expert.

Translate the following knitting/crochet term from ${sourceLang} to ${targetLang}.

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
    throw new Error('Could not parse AI response. Please try a different term.');
  }
}
