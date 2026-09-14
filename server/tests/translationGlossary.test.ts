import { describe, expect, it } from 'vitest';
import {
  auditTranslatedGlossary,
  buildGlossaryPromptSection,
  resolveGlossaryLanguage,
} from '../src/services/translationGlossary';
import {
  createDocumentSystemInstruction,
  createSystemInstruction,
} from '../src/services/gemini';
import { GLOSSARY_LANGUAGES } from '../src/services/glossaryTerms';

describe('resolveGlossaryLanguage', () => {
  it('resolves language names, codes, and aliases', () => {
    expect(resolveGlossaryLanguage('Spanish')).toBe('es');
    expect(resolveGlossaryLanguage('spanish')).toBe('es');
    expect(resolveGlossaryLanguage('es')).toBe('es');
    expect(resolveGlossaryLanguage('Danish')).toBe('da');
    expect(resolveGlossaryLanguage('dk')).toBe('da');
    expect(resolveGlossaryLanguage('English')).toBe('en');
  });

  it('returns null for unknown languages', () => {
    expect(resolveGlossaryLanguage('Klingon')).toBeNull();
    expect(resolveGlossaryLanguage('')).toBeNull();
  });
});

describe('buildGlossaryPromptSection', () => {
  it('emits the locked Spanish term bank', () => {
    const section = buildGlossaryPromptSection('Spanish');

    expect(section).toContain('LOCKED TERMINOLOGY BANK — SPANISH');
    expect(section).toMatch(/LOCKED end-to-end/);
    expect(section).toContain('- knit [K] -> derecho [D]');
    expect(section).toContain('- cast on [CO] -> montar puntos [MO]');
    expect(section).toContain('2 puntos juntos derecho [2pjD]');
    expect(section).toContain('hebra / lazada [H]');
    expect(section).toMatch(/never mix regional variants/i);
    expect(section).toMatch(/STRICT language-specific rule above.*wins/i);
  });

  it.each([
    ['Danish', ['2 ret sammen [2 r sm]', 'Placer markør [pm]']],
    ['French', ['monter les mailles [MO]', 'jeté']],
    ['Korean', ['코잡기 [코잡]', '바늘비우기']],
  ])('emits a locked bank for %s', (language, expectedTerms) => {
    const section = buildGlossaryPromptSection(language);
    expect(section).toContain(`LOCKED TERMINOLOGY BANK — ${language.toUpperCase()}`);
    for (const term of expectedTerms) {
      expect(section).toContain(term);
    }
  });

  it('emits a locked bank for every non-English glossary language', () => {
    for (const { code, name } of GLOSSARY_LANGUAGES) {
      if (code === 'en') continue;
      const section = buildGlossaryPromptSection(name);
      expect(section, name).toContain(`LOCKED TERMINOLOGY BANK — ${name.toUpperCase()}`);
      // Every language covers the vast majority of the ~108-term glossary.
      expect(section.split('\n- ').length, name).toBeGreaterThan(100);
    }
  });

  it('adds the source-language column for a known non-English source', () => {
    const section = buildGlossaryPromptSection('Spanish', 'Danish');
    expect(section).toContain('- knit [K] / ret [r] -> derecho [D]');
  });

  it('keeps English-source banks single-column', () => {
    const section = buildGlossaryPromptSection('Spanish', 'English');
    expect(section).toContain('- knit [K] -> derecho [D]');
    expect(section).not.toContain('- knit [K] / ');
  });

  it('gives English targets variant-consistency rules instead of en→en lines', () => {
    const section = buildGlossaryPromptSection('English');
    expect(section).toContain('LOCKED ENGLISH TERMINOLOGY');
    expect(section).toMatch(/never mix "bind off" with "cast off"/i);
    expect(section).not.toContain('->');
  });

  it('returns an empty section for unsupported languages', () => {
    expect(buildGlossaryPromptSection('Klingon')).toBe('');
  });
});

describe('translate prompt integration', () => {
  it.each([
    ['PDF', createSystemInstruction('Spanish', 'English')],
    ['document', createDocumentSystemInstruction('Spanish', 'English')],
  ])('injects the locked Spanish term bank into the %s prompt', (_kind, prompt) => {
    expect(prompt).toContain('LOCKED TERMINOLOGY BANK — SPANISH');
    expect(prompt).toContain('- knit [K] -> derecho [D]');
    // The handcrafted native-reviewed rules must still be present and first.
    expect(prompt.indexOf('STRICT TERMINOLOGY MAPPINGS FOR SPANISH'))
      .toBeLessThan(prompt.indexOf('LOCKED TERMINOLOGY BANK — SPANISH'));
  });

  it.each(['Danish', 'French', 'Korean'])('injects the locked %s term bank', (language) => {
    expect(createSystemInstruction(language, 'English'))
      .toContain(`LOCKED TERMINOLOGY BANK — ${language.toUpperCase()}`);
    expect(createDocumentSystemInstruction(language, 'English'))
      .toContain(`LOCKED TERMINOLOGY BANK — ${language.toUpperCase()}`);
  });

  it('injects a locked bank even for languages without handcrafted rules', () => {
    const prompt = createSystemInstruction('German', 'English');
    expect(prompt).toContain('LOCKED TERMINOLOGY BANK — GERMAN');
    expect(prompt).toContain('rechts [r]');
  });
});

describe('auditTranslatedGlossary — English term leakage', () => {
  it('warns when a locked English craft term survives into the translation', () => {
    const html = `<div>
      <p data-seg="1" data-o="Cast on 20 sts, then work yarn over at the marker.">Monta 20 pts, luego teje yarn over en el marcador.</p>
    </div>`;

    const warnings = auditTranslatedGlossary(html, 'Spanish');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      code: 'GLOSSARY_TERM_UNTRANSLATED',
      sourceId: 'seg-1',
    });
    expect(warnings[0].message).toContain('"yarn over"');
    expect(warnings[0].message).toContain('hebra / lazada [H]');
  });

  it('warns for leaked English abbreviations such as k2tog', () => {
    const html = `<div>
      <p data-seg="1" data-o="Row 3: k2tog, knit to end.">Fila 3: k2tog, teje hasta el final.</p>
    </div>`;

    const warnings = auditTranslatedGlossary(html, 'Spanish');
    expect(warnings.some((warning) =>
      warning.code === 'GLOSSARY_TERM_UNTRANSLATED' && /"k2tog"/i.test(warning.message),
    )).toBe(true);
  });

  it('stays silent when locked terminology was applied', () => {
    const html = `<div>
      <p data-seg="1" data-o="Cast on 20 sts, then work yarn over at the marker.">Monta 20 pts, luego haz una H (hebra) en el marcador.</p>
      <p data-seg="2" data-o="Row 3: k2tog, knit to end.">Fila 3: 2pjD, teje hasta el final.</p>
    </div>`;

    expect(auditTranslatedGlossary(html, 'Spanish')).toEqual([]);
  });

  it('deduplicates repeated leaks of one term into a single counted warning', () => {
    const html = `<div>
      <p data-seg="1" data-o="Work yarn over once.">Teje yarn over una vez.</p>
      <p data-seg="2" data-o="Then yarn over again.">Luego yarn over otra vez.</p>
    </div>`;

    const warnings = auditTranslatedGlossary(html, 'Spanish');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain('2 translated segments');
  });

  it('does not flag tokens the language-specific rules intentionally preserve', () => {
    // Danish keeps the "pm" token verbatim (locked Danish abbreviation is pm).
    const html = `<div>
      <p data-seg="1" data-o="pm, knit to end of round.">pm, strik til slutningen af omgangen.</p>
    </div>`;

    expect(auditTranslatedGlossary(html, 'Danish')).toEqual([]);
  });

  it('does not flag English tokens that are everyday words in the target language', () => {
    // "tog" (together) is also the Danish word for train/took.
    const html = `<div>
      <p data-seg="1" data-o="Knit 2 sts tog at the end.">Strik 2 m sammen til sidst, som du tog dem.</p>
    </div>`;

    expect(auditTranslatedGlossary(html, 'Danish')).toEqual([]);
  });

  it('does not flag accent-variant locked terms such as raglán', () => {
    const html = `<div>
      <p data-seg="1" data-o="This raglan sweater is worked top-down.">Este jersey raglan se teje de arriba abajo.</p>
    </div>`;

    expect(auditTranslatedGlossary(html, 'Spanish')).toEqual([]);
  });

  it('does not flag intentionally preserved yarn-weight names', () => {
    const html = `<div>
      <p data-seg="1" data-o="Use fingering or DK weight yarn.">Usa lana fingering o DK.</p>
    </div>`;

    expect(auditTranslatedGlossary(html, 'Spanish')).toEqual([]);
  });

  it('does not match abbreviations inside longer words', () => {
    // "sl" must not match inside "sleeve"/"desliza".
    const html = `<div>
      <p data-seg="1" data-o="Shape the sleeve, sl 1 at each end.">Da forma a la manga, desl 1 en cada extremo.</p>
    </div>`;

    expect(auditTranslatedGlossary(html, 'Spanish')).toEqual([]);
  });

  it('returns nothing when the HTML has no aligned segments', () => {
    expect(auditTranslatedGlossary('<div><p>Sin alineación.</p></div>', 'Spanish')).toEqual([]);
  });

  it('returns nothing for languages outside the glossary', () => {
    const html = '<p data-seg="1" data-o="Cast on 20 sts.">Cast on 20 sts.</p>';
    expect(auditTranslatedGlossary(html, 'Klingon')).toEqual([]);
  });
});

describe('auditTranslatedGlossary — US/UK variant mix in English targets', () => {
  it('warns when bind off and cast off are mixed', () => {
    const html = `<div>
      <p data-seg="1" data-o="Luk af.">Bind off all stitches.</p>
      <p data-seg="2" data-o="Luk de sidste masker af.">Cast off the remaining stitches.</p>
    </div>`;

    const warnings = auditTranslatedGlossary(html, 'English');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe('GLOSSARY_VARIANT_MIX');
    expect(warnings[0].message).toContain('"bind off"');
    expect(warnings[0].message).toContain('"cast off"');
  });

  it('stays silent when one variant family is used consistently', () => {
    const html = `<div>
      <p data-seg="1" data-o="Luk af.">Bind off all stitches.</p>
      <p data-seg="2" data-o="Luk de sidste masker af.">Bind off the remaining stitches.</p>
    </div>`;

    expect(auditTranslatedGlossary(html, 'English')).toEqual([]);
  });

  it('warns on a genuine gauge/tension mix', () => {
    const html = `<div>
      <p data-seg="1" data-o="Strikkefasthed">Tension: 22 sts to 10 cm.</p>
      <p data-seg="2" data-o="Kontroller din strikkefasthed.">Check your gauge before starting.</p>
    </div>`;

    const warnings = auditTranslatedGlossary(html, 'English');
    expect(warnings.some((warning) => warning.code === 'GLOSSARY_VARIANT_MIX'
      && warning.message.includes('"gauge"'))).toBe(true);
  });

  it('does not mistake yarn-handling prose for the UK gauge term', () => {
    const html = `<div>
      <p data-seg="1" data-o="Strikkefasthed">Gauge: 22 sts to 10 cm.</p>
      <p data-seg="2" data-o="Strik med jævn løshed.">Keep an even tension while knitting.</p>
    </div>`;

    expect(auditTranslatedGlossary(html, 'English')).toEqual([]);
  });

  it('does not run US/UK checks for non-English targets', () => {
    const html = `<div>
      <p data-seg="1" data-o="Bind off. Cast off.">Remata. Cierra.</p>
    </div>`;

    expect(auditTranslatedGlossary(html, 'Spanish')).toEqual([]);
  });
});
