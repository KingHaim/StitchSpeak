import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stitchspeak-preview-pdf-test-'));
process.env.DATA_DIR = dataDir;

const mocks = vi.hoisted(() => ({
  translatePattern: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('../src/middleware/auth', () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as express.Request & { userSub: string }).userSub = 'user-preview-pdf';
    next();
  },
}));

vi.mock('../src/services/gemini', () => ({
  translatePattern: mocks.translatePattern,
}));

vi.mock('../src/services/translationLeaseStore', () => ({
  acquireTranslationLease: () => 'lease-pdf',
  renewTranslationLease: () => true,
  releaseTranslationLease: () => {},
}));

vi.mock('../src/services/legalAcknowledgementStore', () => ({
  recordAiProcessingAcknowledgement: () => {},
}));

vi.mock('../src/services/translationMemoryStore', () => ({
  getTranslationMemoryForPrompt: () => [],
}));

vi.mock('../src/services/pricing', async () => {
  const actual = await vi.importActual<typeof import('../src/services/pricing')>('../src/services/pricing');
  return {
    ...actual,
    computeDocumentMetrics: async () => ({
      pages: 6,
      characters: 4000,
      estimatedInputTokens: 1500,
      estimatedOutputTokens: 1800,
    }),
    translationCostFromMetrics: (metrics: { characters?: number; pages?: number }) => {
      if ((metrics.pages ?? 0) <= 2 || (metrics.characters ?? 0) < 800) return 2;
      return 8;
    },
  };
});

async function knittingPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = [
    ['Weekend Scarf', 'Cast on 24 stitches.', 'Row 1: Knit.'],
    ['Later sleeve section: continue in pattern until the piece measures the length given for your size.'],
    ['Later sleeve chart: work the next chart after the body is complete.'],
  ];
  for (const lines of pages) {
    const page = doc.addPage([420, 560]);
    let y = 500;
    for (const line of lines) {
      page.drawText(line, { x: 36, y, size: 12, font });
      y -= 22;
    }
  }
  return Buffer.from(await doc.save());
}

let store: typeof import('../src/services/translationPreviewStore');
let credits: typeof import('../src/services/creditStore');
let server: import('node:http').Server;
let base: string;
const originalWarn = console.warn;

beforeAll(async () => {
  store = await import('../src/services/translationPreviewStore');
  credits = await import('../src/services/creditStore');
  const translateRouter = (await import('../src/routes/translate')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/translate', translateRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('No address');
      base = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(dataDir, { recursive: true, force: true });
  console.warn = originalWarn;
});

beforeEach(() => {
  mocks.translatePattern.mockReset();
  mocks.warn.mockReset();
  console.warn = mocks.warn;
  store.deleteTranslationPreviewData('user-preview-pdf');
});

async function startPdfPreview(): Promise<Response> {
  const pdf = await knittingPdf();
  const form = new FormData();
  form.append('file', new File([new Uint8Array(pdf)], 'scarf.pdf', { type: 'application/pdf' }));
  form.append('language', 'Spanish');
  form.append('aiAcknowledged', 'true');
  return fetch(`${base}/api/translate`, { method: 'POST', body: form });
}

describe('US10 PDF visual path', () => {
  it('sends the preview page range through the visual PDF path, not text extract', async () => {
    mocks.translatePattern.mockImplementation(async (buffer: Buffer, mime: string, _lang, _src, options) => {
      expect(mime).toBe('application/pdf');
      expect(options?.sourceHtml).toBeUndefined();
      expect(buffer.length).toBeGreaterThan(0);
      const pdf = await PDFDocument.load(buffer);
      expect(pdf.getPageCount()).toBe(1);
      return {
        html: '<p data-seg="1" data-o="Cast on 24 stitches.">Monta 24 puntos.</p>',
        usage: null,
        reviewWarnings: [{ code: 'NUMBER_UNRESTORABLE', message: 'check this section' }],
      };
    });

    const response = await startPdfPreview();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.preview).toBe(true);
    expect(body.html).toContain('Monta 24 puntos.');
    expect(body.html).not.toContain('Later sleeve');
    expect(body.remainingSourceHtml).toBeUndefined();
    expect(body.remainingPdf).toBeUndefined();
    expect(mocks.translatePattern).toHaveBeenCalledTimes(1);
    expect(mocks.warn).not.toHaveBeenCalled();
  });

  it('resumes remaining PDF pages through the visual path without double-charging preview pages', async () => {
    mocks.translatePattern.mockImplementation(async (buffer: Buffer, mime: string, _lang, _src, options) => {
      expect(mime).toBe('application/pdf');
      expect(options?.sourceHtml).toBeUndefined();
      const pdf = await PDFDocument.load(buffer);
      if (pdf.getPageCount() === 1) {
        return { html: '<p>Monta 24 puntos.</p>', usage: null, reviewWarnings: [] };
      }
      expect(pdf.getPageCount()).toBe(2);
      return { html: '<p>Continúa la manga.</p>', usage: null, reviewWarnings: [] };
    });

    const preview = await startPdfPreview();
    expect(preview.status).toBe(200);
    const previewBody = await preview.json();
    expect(previewBody.html).toContain('Monta 24 puntos.');
    expect(previewBody.html).not.toContain('Continúa la manga.');
    credits.addCredits('user-preview-pdf', 20);
    const job = store.getLatestOpenTranslationJob('user-preview-pdf');
    expect(job?.remainingPdf?.length).toBeGreaterThan(0);
    const remainingBefore = job!.remainingCost;
    expect(remainingBefore).toBeGreaterThan(0);
    const balanceBefore = credits.getBalance('user-preview-pdf');

    const unlock = await fetch(`${base}/api/translate/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: job!.id }),
    });
    expect(unlock.status).toBe(200);
    const body = await unlock.json();
    expect(body.html).toContain('Monta 24 puntos.');
    expect(body.html).toContain('Continúa la manga.');
    expect(body.cost).toBe(remainingBefore);
    expect(credits.getBalance('user-preview-pdf')).toBeCloseTo(balanceBefore - remainingBefore, 2);
    expect(mocks.warn).not.toHaveBeenCalled();
  });

  it('falls back to text extract only after the visual PDF path fails, and logs it', async () => {
    mocks.translatePattern.mockImplementation(async (_buffer, mime, _lang, _src, options) => {
      if (mime === 'application/pdf' && !options?.sourceHtml) {
        throw new Error('visual path exploded');
      }
      expect(options.sourceHtml).toContain('Cast on 24 stitches.');
      expect(options.sourceHtml).not.toContain('Later sleeve chart');
      return {
        html: '<p>Monta 24 puntos (text fallback).</p>',
        usage: null,
        reviewWarnings: [],
      };
    });

    const response = await startPdfPreview();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.html).toContain('text fallback');
    expect(mocks.warn.mock.calls.some((call) => String(call[0]).includes('Visual PDF preview failed; falling back to text extract'))).toBe(true);
  });
});
