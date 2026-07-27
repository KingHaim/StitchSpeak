import { describe, expect, it } from 'vitest';
import {
  createTechEditEditorialSystemInstruction,
  createTechEditExtractionSystemInstruction,
} from '../src/services/techEdit';

describe('tech edit prompts', () => {
  it('distinguishes total repeat counts from additional repeat counts', () => {
    const prompt = createTechEditExtractionSystemInstruction();

    expect(prompt).toContain('REPEAT EXECUTION SEMANTICS');
    expect(prompt).toMatch(/repeat a total of N times[^\n]*N executions/i);
    expect(prompt).toMatch(/repeat (?:N more times|another N times)[^\n]*N additional executions/i);
    expect(prompt).toContain('5 total executions × -2 sts = -10 sts');
    expect(prompt).toContain('1 initial + 5 additional executions = 6 executions × -2 sts = -12 sts');
  });

  it.each([
    ['extraction', createTechEditExtractionSystemInstruction()],
    ['editorial review', createTechEditEditorialSystemInstruction('No discrepancies found.')],
  ])('infers chart-cell activity from visual semantics during %s', (_pass, prompt) => {
    expect(prompt).toContain('CHART CELL ACTIVITY');
    expect(prompt).toContain('Do not infer activity from color alone');
    expect(prompt).toMatch(/legend entries[^\n]*no stitch/i);
    expect(prompt).toContain('the shaped pattern boundary');
    expect(prompt).toContain('continuity across neighboring rows');
    expect(prompt).toMatch(/gray\/grey background cells[^\n]*inactive[^\n]*white cells[^\n]*active stitches/i);
    expect(prompt).toMatch(/inverse or colorwork chart[^\n]*opposite/i);
    expect(prompt).toContain('confidence "low"');
    expect(prompt).toContain('set activeStitchCount to null');
    expect(prompt).toContain('do not assert a numeric chart mismatch');
    expect(prompt).not.toMatch(/7 white cells|14 gray cells/i);
  });
});
