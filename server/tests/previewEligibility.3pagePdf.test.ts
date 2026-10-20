import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractSourceHtml } from '../src/services/documentExtract';
import { cutPreviewHtml, documentPageCount, previewLeavesMeaningfulRemainder } from '../src/services/previewCut';
import { planDocumentPreview, previewPlanFromCut } from '../src/services/previewPlan';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stitchspeak-preview-3page-'));
process.env.DATA_DIR = dataDir;
process.env.FREE_PREVIEW_MODE = 'admins';
process.env.ADMIN_EMAILS = 'jaime@example.com';

const identity = vi.hoisted(() => ({
  current: {
    userSub: 'user-admin-3page',
    userEmail: 'jaime@example.com',
    identityProvider: 'google' as 'google' | 'email',
    emailVerified: true,
  },
}));

const mocks = vi.hoisted(() => ({
  translatePattern: vi.fn(),
}));

vi.mock('../src/middleware/auth', () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    Object.assign(req, identity.current);
    next();
  },
}));

vi.mock('../src/services/gemini', () => ({
  translatePattern: mocks.translatePattern,
}));

vi.mock('../src/services/translationLeaseStore', () => ({
  acquireTranslationLease: () => 'lease-3page',
  renewTranslationLease: () => true,
  releaseTranslationLease: () => {},
}));

vi.mock('../src/services/legalAcknowledgementStore', () => ({
  recordAiProcessingAcknowledgement: () => {},
}));

vi.mock('../src/services/translationMemoryStore', () => ({
  getTranslationMemoryForPrompt: () => [],
}));

/**
 * Synthetic 3-page no-chart knitting PDF (~title page + instructions).
 * Page 1 is materials; the cast-on lives on page 2 so the raw craft cut
 * wants two pages and used to fail the 50% remainder check.
 */
export async function threePageNoChartPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = [
    [
      'Willow Wrap Cardigan',
      'Pattern pu-068',
      'Yarn: 200 (220, 240, 260) g worsted.',
      'Needles: 4 mm circular.',
      'Gauge: 20 sts = 10 cm in stockinette.',
      'Finished bust: 80 (90, 100, 110) cm.',
    ],
    [
      'Cast on 80 (90, 100, 110) stitches.',
      'Row 1: Knit 2, purl 2; repeat from * to end.',
      'Row 2: Knit 2, purl 2; repeat from * to end.',
    ],
    [
      'Later sleeve section row 20: continue in pattern until the piece measures the length given for your size.',
      'Later sleeve section row 21: bind off remaining stitches.',
      'Finishing: weave in ends and block the garment.',
    ],
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
  delete process.env.FREE_PREVIEW_MODE;
  delete process.env.ADMIN_EMAILS;
});

beforeEach(() => {
  mocks.translatePattern.mockReset();
  mocks.translatePattern.mockResolvedValue({
    html: '<p data-seg="1" data-o="Willow Wrap Cardigan">Cárdigan Willow</p>',
    usage: null,
    reviewWarnings: [],
  });
  identity.current = {
    userSub: 'user-admin-3page',
    userEmail: 'jaime@example.com',
    identityProvider: 'google',
    emailVerified: true,
  };
  store.deleteTranslationPreviewData('user-admin-3page');
});

describe('3-page no-chart PDF preview eligibility', () => {
  it('plans a 1-page preview with 2 pages remaining from a generated PDF', async () => {
    const pdf = await threePageNoChartPdf();
    const extracted = await extractSourceHtml(pdf, 'application/pdf', 'willow.pdf');
    expect(extracted.kind).toBe('pdf');
    expect(extracted.html).toContain('data-page="1"');
    expect(extracted.html).toContain('data-page="3"');

    const cut = cutPreviewHtml(extracted.html);
    expect(documentPageCount(cut.segments)).toBe(3);
    expect(cut.previewEndPage).toBeGreaterThanOrEqual(2);
    expect(previewLeavesMeaningfulRemainder(cut, { isPdf: true })).toBe(false);

    const fromCut = previewPlanFromCut(cut, true);
    const fromBytes = await planDocumentPreview(pdf, 'application/pdf', 'willow.pdf');
    expect(fromCut?.previewEndPage).toBe(1);
    expect(fromBytes?.previewEndPage).toBe(1);
    expect(fromBytes?.remainingHtml).toMatch(/cast on|later sleeve/i);
  });

  it('admins estimate reports previewEligible and translate stays free', async () => {
    const pdf = await threePageNoChartPdf();
    credits.addCredits('user-admin-3page', 84.8);
    const file = new File([new Uint8Array(pdf)], 'willow.pdf', { type: 'application/pdf' });

    const estimateForm = new FormData();
    estimateForm.append('file', file);
    const estimate = await fetch(`${base}/api/translate/estimate`, { method: 'POST', body: estimateForm });
    expect(estimate.status).toBe(200);
    const estimateBody = await estimate.json() as {
      translationCost: number;
      previewEligible: boolean;
      previewEndPage: number | null;
      pages: number;
    };
    expect(estimateBody.pages).toBe(3);
    expect(estimateBody.previewEligible).toBe(true);
    expect(estimateBody.previewEndPage).toBe(1);
    expect(estimateBody.translationCost).toBeGreaterThan(0);
    expect(store.hasFreePreviewAvailable('user-admin-3page')).toBe(true);

    const minted = await fetch(`${base}/api/translate/stream-token`, { method: 'POST' });
    expect(minted.status).toBe(200);
    const { token } = await minted.json() as { token: string };

    const translateForm = new FormData();
    translateForm.append('file', new File([new Uint8Array(pdf)], 'willow.pdf', { type: 'application/pdf' }));
    translateForm.append('language', 'Spanish');
    translateForm.append('aiAcknowledged', 'true');
    const translate = await fetch(`${base}/api/translate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: translateForm,
    });
    expect(translate.status).toBe(200);
    const body = await translate.json() as { preview?: boolean; locked?: boolean; cost?: number };
    expect(body.preview).toBe(true);
    expect(body.locked).toBe(true);
    expect(body.cost).toBe(0);
    expect(credits.getBalance('user-admin-3page')).toBeCloseTo(84.8, 5);
    expect(store.hasFreePreviewAvailable('user-admin-3page')).toBe(false);
    expect(mocks.translatePattern).toHaveBeenCalled();
    const previewBuffer = mocks.translatePattern.mock.calls[0]?.[0] as Buffer;
    const previewPdf = await PDFDocument.load(previewBuffer);
    expect(previewPdf.getPageCount()).toBe(1);
  });

  it('does not label a document previewEligible when the account cannot preview', async () => {
    identity.current = {
      userSub: 'user-regular-3page',
      userEmail: 'maker@example.com',
      identityProvider: 'email',
      emailVerified: false,
    };
    const pdf = await threePageNoChartPdf();
    const form = new FormData();
    form.append('file', new File([new Uint8Array(pdf)], 'willow.pdf', { type: 'application/pdf' }));
    const estimate = await fetch(`${base}/api/translate/estimate`, { method: 'POST', body: form });
    expect(estimate.status).toBe(200);
    const body = await estimate.json() as { previewEligible: boolean };
    expect(body.previewEligible).toBe(false);
  });
});
