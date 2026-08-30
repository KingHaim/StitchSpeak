import { describe, expect, it } from 'vitest';
import { buildTypographyCatalog } from '../src/services/pdfTypography';

describe('PDF typography catalog', () => {
  it('includes partial bold runs so glossary abbreviations and selected sizes can be restored', () => {
    const catalog = buildTypographyCatalog({
      bodyFamily: 'Arial',
      hints: [],
      emphasisHints: [
        {
          originalText: 'K2TOG: Knit two stitches together.',
          boldTexts: ['K2TOG:'],
          page: 3,
        },
        {
          originalText: 'Sizes: (Preemie 00), Newborn, (1–3 months), 6–9 months.',
          boldTexts: ['Newborn', '6–9 months'],
          page: 2,
        },
      ],
    });

    expect(catalog).toContain('INLINE EMPHASIS');
    expect(catalog).toContain('BOLD: "K2TOG:"');
    expect(catalog).toContain('BOLD: "Newborn", "6–9 months"');
  });
});
