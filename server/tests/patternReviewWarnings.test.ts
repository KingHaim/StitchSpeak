import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stitchspeak-pattern-warning-test-'));
process.env.DATA_DIR = dataDir;
let store: typeof import('../src/services/patternStore');

beforeAll(async () => { store = await import('../src/services/patternStore'); });
afterAll(() => fs.rmSync(dataDir, { recursive: true, force: true }));

describe('saved translation review warnings', () => {
  it('persists manual-review findings with the translated pattern', () => {
    const saved = store.savePattern('user-review', {
      fileName: 'pattern.docx',
      targetLanguage: 'French',
      html: '<p>Traduction</p>',
      reviewWarnings: [{
        code: 'EMPTY_PARAGRAPH_CHANGED',
        sourceId: 'src-4',
        message: 'An intentional empty paragraph changed.',
      }],
    });

    expect(saved.reviewWarnings).toHaveLength(1);
    expect(store.getPattern('user-review', saved.id)?.reviewWarnings).toEqual(saved.reviewWarnings);
    expect(store.listPatterns('user-review')[0].reviewWarnings).toEqual(saved.reviewWarnings);
  });
});
