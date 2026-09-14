import { describe, expect, it } from 'vitest';
import { flaggedSegIds, loudReviewWarnings, segIdFromWarning, warningKindLabel } from './reviewSegments';
import type { TranslationReviewWarning } from '../types';

const alignedHtml =
  '<p data-seg="1" data-o="Cast on 20 sts.">Monta 20 pts.</p>' +
  '<p data-seg="2" data-o="Knit 10 rows.">Teje 10 vueltas.</p>';

describe('segIdFromWarning', () => {
  it('extracts the data-seg id from a seg-N sourceId', () => {
    expect(segIdFromWarning({ code: 'NUMBER_RESTORED', sourceId: 'seg-2', message: 'x' }))
      .toBe('2');
  });

  it('returns null for document-level warnings without a sourceId', () => {
    expect(segIdFromWarning({ code: 'GLOSSARY_VARIANT_MIX', message: 'x' })).toBeNull();
  });
});

describe('flaggedSegIds', () => {
  it('flags only warnings whose segment exists in the aligned HTML', () => {
    const warnings: TranslationReviewWarning[] = [
      { code: 'NUMBER_RESTORED', sourceId: 'seg-1', message: 'restored numbers' },
      { code: 'GLOSSARY_TERM_UNTRANSLATED', sourceId: 'seg-2', message: 'leaked term' },
      // Segment not present in this HTML (e.g. removed by a retry).
      { code: 'NUMBER_RESTORED', sourceId: 'seg-9', message: 'gone' },
      // Document-level warning with no segment.
      { code: 'GLOSSARY_VARIANT_MIX', message: 'mixed US/UK variants' },
    ];

    expect(flaggedSegIds(warnings, alignedHtml)).toEqual(new Set(['1', '2']));
  });

  it('returns an empty set when there are no warnings', () => {
    expect(flaggedSegIds([], alignedHtml).size).toBe(0);
  });
});

describe('loudReviewWarnings', () => {
  it('filters resolved restored-number items so they never reach the loud strip', () => {
    const warnings: TranslationReviewWarning[] = [
      // Resolved by an automated pass (deterministic restore or a successful
      // number-lock retry) — telemetry, not review work. Patterns saved
      // before the server stopped delivering these still carry them.
      { code: 'NUMBER_RESTORED', sourceId: 'seg-1', message: 'restored numbers' },
      { code: 'NUMBER_UNRESTORABLE', sourceId: 'seg-2', message: 'numbers do not match' },
      { code: 'UNAUDITED_NUMBERS', sourceId: 'seg-3', message: 'could not be checked' },
      { code: 'GLOSSARY_VARIANT_MIX', message: 'mixed US/UK variants' },
    ];

    expect(loudReviewWarnings(warnings).map((warning) => warning.code)).toEqual([
      'NUMBER_UNRESTORABLE',
      'UNAUDITED_NUMBERS',
      'GLOSSARY_VARIANT_MIX',
    ]);
  });

  it('returns an empty list when every item was resolved', () => {
    expect(
      loudReviewWarnings([{ code: 'NUMBER_RESTORED', sourceId: 'seg-1', message: 'restored' }]),
    ).toEqual([]);
  });
});

describe('warningKindLabel', () => {
  it('labels number-fidelity and glossary warning codes', () => {
    expect(warningKindLabel('NUMBER_RESTORED')).toBe('Numbers');
    expect(warningKindLabel('NUMBER_UNRESTORABLE')).toBe('Numbers');
    expect(warningKindLabel('UNAUDITED_NUMBERS')).toBe('Numbers');
    expect(warningKindLabel('GLOSSARY_TERM_UNTRANSLATED')).toBe('Glossary');
    expect(warningKindLabel('GLOSSARY_VARIANT_MIX')).toBe('Glossary');
    expect(warningKindLabel('SOMETHING_ELSE')).toBe('Review');
  });
});
