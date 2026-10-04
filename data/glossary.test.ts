import { describe, expect, it } from 'vitest';
import { GLOSSARY_TERMS } from './glossary';

describe('Danish glossary terminology', () => {
  it('distinguishes place marker from slip marker', () => {
    expect(GLOSSARY_TERMS.find((term) => term.id === 'pm')?.terms.da).toEqual({
      abbreviation: 'pm',
      full: 'Placer markør',
    });
    expect(GLOSSARY_TERMS.find((term) => term.id === 'slm')?.terms.da).toEqual({
      abbreviation: 'fm',
      full: 'Flyt markør',
    });
  });

  it('uses the native-reviewed definite forms for right and wrong side', () => {
    expect(GLOSSARY_TERMS.find((term) => term.id === 'rs')?.terms.da.full).toBe('retsiden');
    expect(GLOSSARY_TERMS.find((term) => term.id === 'ws')?.terms.da.full).toBe('vrangsiden');
  });
});

describe('French glossary terminology', () => {
  const french = (id: string) => GLOSSARY_TERMS.find((term) => term.id === id)?.terms.fr;

  it('locks the approved French knitting terms without synonym lists', () => {
    expect(french('ssk')).toEqual({
      abbreviation: 'GGT',
      full: 'glisser, glisser, tricoter les deux mailles ensemble',
    });
    expect(french('sl1_k1_psso')).toEqual({
      abbreviation: '',
      full: 'glisser 1 maille, tricoter 1 maille endroit, passer la maille glissée par-dessus',
    });
    expect(french('skp')?.full).toBe(
      'glisser 1 maille, tricoter 1 maille endroit, passer la maille glissée par-dessus',
    );
    expect(french('folded_1x1_rib_collar')).toEqual({
      abbreviation: '',
      full: 'col replié en côtes 1×1',
    });
    expect(french('lace_weight_yarn')).toEqual({
      abbreviation: '',
      full: 'fil de grosseur dentelle',
    });
    expect(french('inches')).toEqual({ abbreviation: '', full: 'pouces' });
    expect(french('setup_row')).toEqual({
      abbreviation: 'tour de préparation',
      full: 'rang de préparation',
    });
    expect(french('half_fishermans_rib')).toEqual({
      abbreviation: '',
      full: 'demi-côtes anglaises',
    });
    expect(french('bo')).toEqual({ abbreviation: 'rabattre', full: 'rabattage' });
    expect(french('pfb')).toEqual({
      abbreviation: '',
      full: 'tricoter la même maille à l\'envers dans le brin avant, puis dans le brin arrière',
    });
  });

  it('keeps lace as the stitch/fabric and does not add synonym rows', () => {
    expect(french('lace')?.full).toBe('dentelle');
    expect(GLOSSARY_TERMS.find((term) => term.id === 'lace_weight_yarn')?.terms.es).toBeUndefined();
    expect(GLOSSARY_TERMS.find((term) => term.id === 'setup_round')).toBeUndefined();
  });
});

describe('Spanish glossary terminology', () => {
  const spanish = (id: string) => GLOSSARY_TERMS.find((term) => term.id === id)?.terms.es;

  it('distinguishes flat rows, circular rounds, and the beginning of round', () => {
    expect(spanish('row')).toEqual({ abbreviation: 'f', full: 'filas' });
    expect(spanish('rnd')).toEqual({ abbreviation: 'v', full: 'vueltas' });
    expect(spanish('bor')).toEqual({ abbreviation: 'CV', full: 'comienzo de vuelta' });
  });

  it('uses the approved marker and increase abbreviations', () => {
    expect(spanish('pm')).toEqual({ abbreviation: 'pm', full: 'poner marcador' });
    expect(spanish('slm')).toEqual({ abbreviation: 'dm', full: 'deslizar marcador' });
    expect(spanish('m1r')?.abbreviation).toBe('A1D');
    expect(spanish('m1l')?.abbreviation).toBe('A1I');
    expect(spanish('k2tog')?.abbreviation).toBe('2pjD');
  });

  it('uses LD and LR consistently for the right and wrong sides', () => {
    expect(spanish('rs')?.abbreviation).toBe('LD');
    expect(spanish('ws')?.abbreviation).toBe('LR');
  });
});
