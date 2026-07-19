import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createDocumentSystemInstruction,
  createSystemInstruction,
} from '../src/services/gemini';

describe('Gemini translation prompts', () => {
  it.each([
    ['PDF', createSystemInstruction('English')],
    ['document', createDocumentSystemInstruction('English')],
  ])('tells %s translation to preserve source size formatting', (_kind, prompt) => {
    expect(prompt).toContain('SIZE FORMAT PRESERVATION');
    expect(prompt).toContain("preserve the source pattern's exact size structure");
    expect(prompt).toContain('Keep the same punctuation and grouping used by the source');
    expect(prompt).toContain(
      'if the source alternates "<strong>18</strong> (20, <strong>23</strong>, 25, <strong>27</strong>, 30)", keep those same bold slots and parentheses',
    );
    expect(prompt).not.toMatch(/alternating bold pattern/i);
  });

  it('does not reintroduce the old global sizing algorithm', () => {
    const source = fs.readFileSync(new URL('../src/services/gemini.ts', import.meta.url), 'utf8');

    expect(source).not.toMatch(/Zebra Bolding/i);
  });
});
