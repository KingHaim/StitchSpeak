import { describe, expect, it } from 'vitest';
import {
  createTechEditEditorialSystemInstruction,
  createTechEditExtractionSystemInstruction,
  createTechEditQuestionSystemInstruction,
  filterEditorialFindingsAgainstGlossary,
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

  it('keeps finding follow-ups scoped to saved evidence', () => {
    const prompt = createTechEditQuestionSystemInstruction();

    expect(prompt).toContain('ONE finding');
    expect(prompt).toMatch(/Never invent source text, stitch counts, chart details, or page content/i);
    expect(prompt).toMatch(/model-generated finding can be wrong/i);
    expect(prompt).toMatch(/evidence is insufficient/i);
    expect(prompt).toMatch(/do not claim that you opened or re-read the source document/i);
  });

  it('treats glossary entries on a continuation page as already defined', () => {
    const extractionPrompt = createTechEditExtractionSystemInstruction();
    const editorialPrompt = createTechEditEditorialSystemInstruction(
      'No discrepancies found.',
      undefined,
      ['M1Rp', 'M1Lp'],
    );

    expect(extractionPrompt).toMatch(/continue across one or more page breaks without repeating its heading/i);
    expect(extractionPrompt).toContain('M1Rp: Insert ...');
    expect(editorialPrompt).toContain('["M1Rp","M1Lp"]');
    expect(editorialPrompt).toMatch(/Never report one of these items as missing from the glossary/i);
    expect(editorialPrompt).toMatch(/page layout is not semantic structure/i);
    expect(editorialPrompt).toMatch(/search the entire glossary run and all continuation pages/i);
  });

  it('removes a missing-glossary finding contradicted by extracted definitions', () => {
    const finding = {
      category: 'consistency' as const,
      severity: 'warning' as const,
      verified: false,
      location: 'Glossary (Page 3) and Back (Page 4)',
      title: 'Abbreviations defined in text but missing from Glossary',
      detail: "The abbreviations 'M1Rp' and 'M1Lp' are defined on page 4 but missing from the Glossary.",
      suggestion: "Move the definitions for 'M1Rp' and 'M1Lp' to the Glossary.",
    };

    expect(filterEditorialFindingsAgainstGlossary([finding], ['M1Rp', 'M1Lp'])).toEqual([]);
    expect(filterEditorialFindingsAgainstGlossary([finding], [])).toEqual([finding]);
  });
});
