import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { TechEditReport } from '../src/services/techEditMath';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stitchspeak-tech-edit-questions-'));
process.env.DATA_DIR = dataDir;

let store: typeof import('../src/services/techEditStore');

const report: TechEditReport = {
  patternTitle: 'Flat Cardigan',
  language: 'English',
  summary: 'One terminology issue was found.',
  stats: {
    checksRun: 1,
    sizesChecked: 1,
    findingCounts: { critical: 0, warning: 1, suggestion: 0 },
  },
  findings: [
    {
      category: 'consistency',
      severity: 'warning',
      verified: false,
      location: 'Back — page 4',
      title: "Incorrect use of 'round' when working flat",
      detail: "The instruction says 'end of the round' in a section worked flat.",
      suggestion: "Change 'end of the round' to 'end of the row'.",
    },
  ],
};

beforeAll(async () => {
  store = await import('../src/services/techEditStore');
});

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('tech edit finding questions', () => {
  it('persists an isolated conversation for an owned finding', () => {
    const saved = store.saveTechEdit('designer-1', {
      fileName: 'cardigan.pdf',
      pages: 8,
      cost: 9,
      report,
    });

    expect(store.getTechEditFindingMessages('designer-1', saved.id, 0)).toEqual([]);
    expect(store.getTechEditFindingMessages('designer-2', saved.id, 0)).toBeNull();
    expect(store.getTechEditFindingMessages('designer-1', saved.id, 99)).toBeNull();

    const messages = store.appendTechEditFindingExchange(
      'designer-1',
      saved.id,
      0,
      'Why is round incorrect here?',
      'Flat knitting proceeds in rows, not rounds.',
    );

    expect(messages).toMatchObject([
      { role: 'user', content: 'Why is round incorrect here?' },
      { role: 'model', content: 'Flat knitting proceeds in rows, not rounds.' },
    ]);
  });

  it('removes the conversation when its report is deleted', () => {
    const saved = store.saveTechEdit('designer-3', {
      fileName: 'vest.pdf',
      pages: 4,
      cost: 9,
      report,
    });
    store.appendTechEditFindingExchange('designer-3', saved.id, 0, 'Question', 'Answer');

    expect(store.deleteTechEdit('designer-3', saved.id)).toBe(true);
    expect(store.getTechEditFindingMessages('designer-3', saved.id, 0)).toBeNull();
  });
});
