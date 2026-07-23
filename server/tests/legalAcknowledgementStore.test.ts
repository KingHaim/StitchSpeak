import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stitchspeak-legal-test-'));
process.env.DATA_DIR = dataDir;
let store: typeof import('../src/services/legalAcknowledgementStore');

beforeAll(async () => { store = await import('../src/services/legalAcknowledgementStore'); });
afterAll(() => fs.rmSync(dataDir, { recursive: true, force: true }));

describe('Assisted processing acknowledgements', () => {
  it('records the current notice version and removes it with the account', () => {
    store.recordAiProcessingAcknowledgement('user-1');
    expect(store.listLegalAcknowledgements('user-1')).toEqual([
      expect.objectContaining({ noticeVersion: store.AI_NOTICE_VERSION }),
    ]);
    store.deleteLegalAcknowledgements('user-1');
    expect(store.listLegalAcknowledgements('user-1')).toEqual([]);
  });
});
