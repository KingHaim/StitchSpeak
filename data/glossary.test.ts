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
