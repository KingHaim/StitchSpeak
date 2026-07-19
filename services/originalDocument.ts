/**
 * Client-side extraction of the original pattern text from a source file
 * (DOCX / RTF / plain text), used to render the "Original pattern" pane and
 * to synthesize bilingual alignment for records saved without it.
 */

function getExtension(file: File): string {
  const idx = file.name.lastIndexOf('.');
  return idx >= 0 ? file.name.slice(idx).toLowerCase() : '';
}

export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || getExtension(file) === '.pdf';
}

export function isDocxFile(file: File): boolean {
  const ext = getExtension(file);
  return (
    ext === '.docx' ||
    ext === '.doc' ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    file.type === 'application/msword'
  );
}

export function isPlainTextFile(file: File): boolean {
  const ext = getExtension(file);
  return (
    ext === '.txt' ||
    ext === '.rtf' ||
    file.type === 'text/plain' ||
    file.type === 'text/rtf' ||
    file.type === 'application/rtf'
  );
}

/** True when we can pull readable text out of the file in the browser. */
export function isTextExtractableFile(file: File): boolean {
  return isDocxFile(file) || isPlainTextFile(file);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function plainTextToHtml(text: string): string {
  const blocks = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length === 0) {
    return `<p>${escapeHtml(text.trim())}</p>`;
  }

  return blocks
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/**
 * Extract the original document as simple HTML. Returns '' for file types we
 * can't extract in the browser (e.g. PDF — rendered as page images instead).
 */
export async function extractOriginalHtml(file: File): Promise<string> {
  if (isDocxFile(file)) {
    const mammoth = await import('mammoth');
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer });
    return result.value?.trim() ?? '';
  }

  if (isPlainTextFile(file)) {
    const text = await file.text();
    return plainTextToHtml(text);
  }

  return '';
}
