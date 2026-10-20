export const PDF_FONT_FAMILY = 'NotoSans';

const REGULAR_FILE = 'NotoSans-Regular.ttf';
const BOLD_FILE = 'NotoSans-Bold.ttf';

// Vite emits these as hashed assets in the browser build. Do not treat the
// rewritten URL as a real filesystem path — Vitest maps it to /services/fonts.
const REGULAR_URL = new URL(`./fonts/${REGULAR_FILE}`, import.meta.url);
const BOLD_URL = new URL(`./fonts/${BOLD_FILE}`, import.meta.url);

let fontBase64Promise: Promise<{ regular: string; bold: string }> | null = null;

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  const chunk = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

async function readExistingFile(path: string): Promise<Uint8Array | null> {
  const { readFile } = await import('node:fs/promises');
  try {
    return new Uint8Array(await readFile(path));
  } catch {
    return null;
  }
}

async function readFontFromDisk(fileName: string): Promise<Uint8Array | null> {
  const { join } = await import('node:path');
  const fromCwd = await readExistingFile(join(process.cwd(), 'services', 'fonts', fileName));
  if (fromCwd) return fromCwd;

  try {
    const { fileURLToPath } = await import('node:url');
    const { dirname } = await import('node:path');
    const dir = dirname(fileURLToPath(import.meta.url));
    if (dir.startsWith('/') && !dir.startsWith('/services')) {
      return readExistingFile(join(dir, 'fonts', fileName));
    }
  } catch {
    return null;
  }
  return null;
}

async function readAssetBytes(fileName: string, url: URL): Promise<Uint8Array> {
  if (typeof process !== 'undefined' && process.versions?.node) {
    const fromDisk = await readFontFromDisk(fileName);
    if (fromDisk) return fromDisk;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load font ${url.href}: ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/** Lazy-load Noto Sans regular + bold as base64 so the JS bundle stays small. */
export function loadNotoSansBase64(): Promise<{ regular: string; bold: string }> {
  if (!fontBase64Promise) {
    fontBase64Promise = Promise.all([
      readAssetBytes(REGULAR_FILE, REGULAR_URL).then(bytesToBase64),
      readAssetBytes(BOLD_FILE, BOLD_URL).then(bytesToBase64),
    ]).then(([regular, bold]) => ({ regular, bold }));
  }
  return fontBase64Promise;
}

export async function registerNotoSans(pdf: {
  addFileToVFS: (filename: string, filecontent: string) => unknown;
  addFont: (postScriptName: string, id: string, fontStyle: string) => unknown;
}): Promise<void> {
  const fonts = await loadNotoSansBase64();
  pdf.addFileToVFS('NotoSans-Regular.ttf', fonts.regular);
  pdf.addFont('NotoSans-Regular.ttf', PDF_FONT_FAMILY, 'normal');
  pdf.addFileToVFS('NotoSans-Bold.ttf', fonts.bold);
  pdf.addFont('NotoSans-Bold.ttf', PDF_FONT_FAMILY, 'bold');
}
