import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  applyBodyBlockTranslations,
  applyCoverHeadingTranslations,
  applyDanishQaRepairs,
  applySpanishQaRepairs,
  applyInlineEmphasisRepairs,
  applyTableCellTranslations,
  createBodyResidueRepairSystemInstruction,
  createDocumentSystemInstruction,
  createDanishQaSystemInstruction,
  createFrenchQaSystemInstruction,
  createInlineEmphasisRepairSystemInstruction,
  createSpanishQaSystemInstruction,
  createSystemInstruction,
  createTableCellRepairSystemInstruction,
  createTitleRepairSystemInstruction,
  createTranslationMemoryInstruction,
  extractCoverHeadingsForVerification,
  extractDanishQaBlocks,
  extractInlineEmphasisCandidates,
  extractSourceInlineEmphasisHints,
  extractTableCellsForVerification,
  extractUntranslatedBlocksForVerification,
  withRetry,
} from '../src/services/gemini';

describe('Gemini translation prompts', () => {
  it('does not retry a depleted provider prepayment balance', async () => {
    let calls = 0;
    await expect(withRetry(async () => {
      calls += 1;
      throw new Error('Your prepayment credits are depleted. Please manage your project and billing. RESOURCE_EXHAUSTED');
    })).rejects.toThrow(/prepayment credits are depleted/i);
    expect(calls).toBe(1);
  });

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

  it('requires PDF chart legends as translated 2-column tables over ROW groups', () => {
    const prompt = createSystemInstruction('Spanish');

    expect(prompt).toContain('STITCH CHART LEGENDS');
    expect(prompt).toContain('OVERRIDES ROW GROUPS');
    expect(prompt).toContain('EXACTLY 2 columns');
    expect(prompt).toContain('LEGEND SYMBOL');
    expect(prompt).toMatch(/Legend symbols always use form 3/i);
    expect(prompt).toContain('Símbolo');
    expect(prompt).toContain('Significado');
    expect(prompt).toContain('k2tog');
    expect(prompt).toContain('2pjD');
    expect(prompt).toContain('DDC');
    expect(prompt).toMatch(/Leaving English knitting abbreviations untranslated/i);
    expect(prompt).toMatch(/English abbreviations are NOT "international"/i);
  });

  it('requires decorative image-based section titles to become translated semantic headings', () => {
    const prompt = createSystemInstruction('Danish');

    expect(prompt).toContain('DECORATIVE OR IMAGE-BASED HEADINGS');
    expect(prompt).toMatch(/visible words.*inside.*image.*section heading/i);
    expect(prompt).toMatch(/Materials Needed.*<h2>/i);
    expect(prompt).toMatch(/replace.*text-only heading graphic.*translated semantic heading/i);
    expect(prompt).toMatch(/every TYPOGRAPHY HINT.*must have.*translated heading/i);
  });

  it.each([
    ['PDF', createSystemInstruction('Danish')],
    ['document', createDocumentSystemInstruction('Danish')],
  ])('requires %s cover titles and subtitles to be translated', (_kind, prompt) => {
    expect(prompt).toContain('TITLE & COVER TEXT');
    expect(prompt).toContain('Lazos Sweater & Vest');
    expect(prompt).toContain('Baby & Toddler');
    expect(prompt).toMatch(/preserve only .*Lazos.*translate .*Sweater & Vest/i);
    expect(prompt).toMatch(/garment types.*age groups.*audience labels.*conjunctions/i);
  });

  it('extracts only the cover title sequence for final verification', () => {
    const html = `<div>
      <p>[IMG_1]</p>
      <h1 data-seg="1" data-o="Lazos Sweater &amp; Vest">Lazos Sweater &amp; Vest</h1>
      <h2 data-seg="2" data-o="Baby &amp; Toddler">Baby &amp; Toddler</h2>
      <p data-seg="3" data-o="Introduction">Indledning</p>
      <h2 data-seg="4" data-o="Materials">Materialer</h2>
    </div>`;

    expect(extractCoverHeadingsForVerification(html)).toEqual([
      {
        id: 'cover-1',
        originalText: 'Lazos Sweater & Vest',
        currentText: 'Lazos Sweater & Vest',
      },
      {
        id: 'cover-2',
        originalText: 'Baby & Toddler',
        currentText: 'Baby & Toddler',
      },
    ]);
  });

  it('replaces copied cover wording while preserving heading attributes and body content', () => {
    const html = `<div><h1 data-seg="1" data-o="Lazos Sweater &amp; Vest">Lazos Sweater &amp; Vest</h1><h2 data-seg="2" data-o="Baby &amp; Toddler">Baby &amp; Toddler</h2><p>Body</p></div>`;
    const repaired = applyCoverHeadingTranslations(html, [
      { id: 'cover-1', text: 'Lazos sweater og vest' },
      { id: 'cover-2', text: 'Baby og småbørn' },
    ]);

    expect(repaired).toContain('data-o="Lazos Sweater &amp; Vest">Lazos sweater og vest</h1>');
    expect(repaired).toContain('data-o="Baby &amp; Toddler">Baby og småbørn</h2>');
    expect(repaired).toContain('<p>Body</p>');
  });

  it('gives the title repair pass explicit mixed-name guidance', () => {
    const prompt = createTitleRepairSystemInstruction('Danish', 'English');

    expect(prompt).toContain('source language is English');
    expect(prompt).toMatch(/preserve "Lazos" but translate "Sweater & Vest"/i);
    expect(prompt).toMatch(/Translate "Baby & Toddler" naturally into Danish/i);
    expect(prompt).toMatch(/Do not add HTML/i);
  });

  it('detects unchanged body labels without flagging translated sizing text', () => {
    const html = `<div>
      <p data-seg="10" data-o="Sweater version:"><strong>Sweater version:</strong></p>
      <p data-seg="11" data-o="Approx. (125), 150, (165) g">Ca. (125), <strong>150</strong>, (165) g</p>
      <p data-seg="12" data-o="Vest version:"><strong>Vest version:</strong></p>
    </div>`;

    expect(extractUntranslatedBlocksForVerification(html)).toEqual([
      { id: 'body-1', originalText: 'Sweater version:', currentText: 'Sweater version:' },
      { id: 'body-2', originalText: 'Vest version:', currentText: 'Vest version:' },
    ]);
  });

  it('repairs unchanged labels while preserving their bold styling and the sizing line', () => {
    const html = `<div>
      <p data-seg="10" data-o="Sweater version:"><strong>Sweater version:</strong></p>
      <p data-seg="11" data-o="Approx. (125), 150, (165) g">Ca. (125), <strong>150</strong>, (165) g</p>
      <p data-seg="12" data-o="Vest version:"><strong>Vest version:</strong></p>
    </div>`;

    const repaired = applyBodyBlockTranslations(html, [
      { id: 'body-1', text: 'Trøjeversion:' },
      { id: 'body-2', text: 'Vestversion:' },
    ]);

    expect(repaired).toContain('<strong>Trøjeversion:</strong>');
    expect(repaired).toContain('<strong>Vestversion:</strong>');
    expect(repaired).toContain('Ca. (125), <strong>150</strong>, (165) g');
  });

  it('tells the residue repair that garment version labels are descriptive text', () => {
    const prompt = createBodyResidueRepairSystemInstruction('Danish', 'English');

    expect(prompt).toMatch(/Sweater version.*Vest version/i);
    expect(prompt).toMatch(/descriptive labels.*not.*product names/i);
    expect(prompt).toMatch(/preserve.*numbers.*units.*punctuation/i);
  });

  it('extracts textual table headers and size labels but skips numeric measurement cells', () => {
    const html = `<table><thead><tr>
      <th>Size</th><th>Chest circumference</th><th>V neck depth</th>
    </tr></thead><tbody><tr>
      <td>Newborn</td><td><strong>1–3 months</strong></td><td>45.5</td><td>cm</td>
    </tr></tbody></table>`;

    expect(extractTableCellsForVerification(html)).toEqual([
      { id: 'table-cell-1', currentText: 'Size' },
      { id: 'table-cell-2', currentText: 'Chest circumference' },
      { id: 'table-cell-3', currentText: 'V neck depth' },
      { id: 'table-cell-4', currentText: 'Newborn' },
      { id: 'table-cell-5', currentText: '1–3 months' },
    ]);
  });

  it('repairs table text while preserving tags and numeric measurements', () => {
    const html = `<table><tr><th>Size</th><th>Chest circumference</th></tr><tr>
      <td>Newborn</td><td><strong>1–3 months</strong></td><td>45.5</td>
    </tr></table>`;
    const repaired = applyTableCellTranslations(html, [
      { id: 'table-cell-1', text: 'Størrelse' },
      { id: 'table-cell-2', text: 'Brystomkreds' },
      { id: 'table-cell-3', text: 'Nyfødt' },
      { id: 'table-cell-4', text: '1–3 måneder' },
    ]);

    expect(repaired).toContain('<th>Størrelse</th>');
    expect(repaired).toContain('<th>Brystomkreds</th>');
    expect(repaired).toContain('<td>Nyfødt</td>');
    expect(repaired).toContain('<strong>1–3 måneder</strong>');
    expect(repaired).toContain('<td>45.5</td>');
  });

  it('requires every human-language table cell to be localized', () => {
    const prompt = createTableCellRepairSystemInstruction('Danish', 'English');

    expect(prompt).toMatch(/every.*table header.*textual table cell/i);
    expect(prompt).toMatch(/Size.*Chest circumference.*Newborn.*months/i);
    expect(prompt).toMatch(/preserve.*numbers.*decimal separators.*units/i);
  });

  it.each([
    ['PDF', createSystemInstruction('Danish', 'English')],
    ['document', createDocumentSystemInstruction('Danish', 'English')],
  ])('requires %s translation to localize table headings and written sizes', (_kind, prompt) => {
    expect(prompt).toMatch(/translate every human-language <th> and <td>/i);
    expect(prompt).toMatch(/Size.*Chest circumference.*Newborn.*months.*years/i);
    expect(prompt).toMatch(/preserve.*numeric measurements.*decimal separators.*units/i);
  });

  it('extracts the exact bold fragments from glossary and size blocks', () => {
    const source = `<div>
      <p><strong>K2TOG:</strong> Knit two stitches together.</p>
      <p>Sizes: (Preemie 00), <strong>Newborn</strong>, (1–3 months), <strong>6–9 months</strong>.</p>
    </div>`;

    expect(extractSourceInlineEmphasisHints(source)).toEqual([
      {
        originalText: 'K2TOG: Knit two stitches together.',
        boldTexts: ['K2TOG:'],
      },
      {
        originalText: 'Sizes: (Preemie 00), Newborn, (1–3 months), 6–9 months.',
        boldTexts: ['Newborn', '6–9 months'],
      },
    ]);
  });

  it('restores only the translated fragments that were bold in the original', () => {
    const hints = extractSourceInlineEmphasisHints(`<div>
      <p><strong>K2TOG:</strong> Knit two stitches together.</p>
      <p>Sizes: (Preemie 00), <strong>Newborn</strong>, (1–3 months), <strong>6–9 months</strong>.</p>
    </div>`);
    const translated = `<div>
      <p data-seg="1" data-o="K2TOG: Knit two stitches together.">2pjD: Tejer dos puntos juntos.</p>
      <p data-seg="2" data-o="Sizes: (Preemie 00), Newborn, (1–3 months), 6–9 months.">Tallas: (Prematuro 00), Recién nacido, (1–3 meses), 6–9 meses.</p>
    </div>`;

    expect(extractInlineEmphasisCandidates(translated, hints)).toEqual([
      {
        id: 'emphasis-1',
        originalText: 'K2TOG: Knit two stitches together.',
        currentText: '2pjD: Tejer dos puntos juntos.',
        boldSourceTexts: ['K2TOG:'],
      },
      {
        id: 'emphasis-2',
        originalText: 'Sizes: (Preemie 00), Newborn, (1–3 months), 6–9 months.',
        currentText: 'Tallas: (Prematuro 00), Recién nacido, (1–3 meses), 6–9 meses.',
        boldSourceTexts: ['Newborn', '6–9 months'],
      },
    ]);

    const repaired = applyInlineEmphasisRepairs(translated, hints, [
      { id: 'emphasis-1', boldTexts: ['2pjD:'] },
      { id: 'emphasis-2', boldTexts: ['Recién nacido', '6–9 meses'] },
    ]);

    expect(repaired).toContain('<strong>2pjD:</strong> Tejer dos puntos juntos.');
    expect(repaired).toContain(
      'Tallas: (Prematuro 00), <strong>Recién nacido</strong>, (1–3 meses), <strong>6–9 meses</strong>.',
    );
    expect(repaired).not.toContain('<strong>Prematuro 00</strong>');
    expect(repaired).not.toContain('<strong>1–3 meses</strong>');
  });

  it('does not bold a second occurrence when the intended fragment is already bold', () => {
    const hints = [{
      originalText: 'Newborn is the Newborn size.',
      boldTexts: ['Newborn'],
    }];
    const translated = '<p data-o="Newborn is the Newborn size."><strong>Recién nacido</strong> es la talla Recién nacido.</p>';

    expect(applyInlineEmphasisRepairs(translated, hints, [
      { id: 'emphasis-1', boldTexts: ['Recién nacido'] },
    ])).toBe(translated);
  });

  it('does not match a short bold heading to an unrelated paragraph containing the same word', () => {
    const translated = '<div><h2 data-o="Note">Nota</h2><p data-o="This note explains the fit.">Esta nota explica el ajuste.</p></div>';
    const hints = [{ originalText: 'Note', boldTexts: ['Note'] }];

    expect(extractInlineEmphasisCandidates(translated, hints)).toEqual([
      {
        id: 'emphasis-1',
        originalText: 'Note',
        currentText: 'Nota',
        boldSourceTexts: ['Note'],
      },
    ]);
  });

  it('requires the emphasis repair to map source bold fragments onto exact target substrings', () => {
    const prompt = createInlineEmphasisRepairSystemInstruction('Spanish', 'English');

    expect(prompt).toMatch(/same semantic fragments.*bold in the source/i);
    expect(prompt).toMatch(/glossary abbreviation.*colon/i);
    expect(prompt).toMatch(/exact size entries/i);
    expect(prompt).toMatch(/exact substring.*current translated text/i);
  });

  it.each([
    ['PDF', createSystemInstruction('Danish', 'English')],
    ['document', createDocumentSystemInstruction('Danish', 'English')],
  ])('includes native-reviewed Danish terminology and style rules in the %s prompt', (_kind, prompt) => {
    expect(prompt).toContain('STRICT TERMINOLOGY AND QA RULES FOR DANISH');
    expect(prompt).toMatch(/toddler.*småbørn/i);
    expect(prompt).toMatch(/garment.*trøje.*trøjen.*generic.*tøj/i);
    expect(prompt).toMatch(/positive ease.*bevægelsesrum/i);
    expect(prompt).toMatch(/put stitches on hold.*sæt maskerne til hvile/i);
    expect(prompt).toMatch(/remain on hold.*maskerne hviler fortsat/i);
    expect(prompt).toMatch(/sweater version.*Sweater-versionen/i);
    expect(prompt).toMatch(/charted cable instructions.*snoningsdiagrammer/i);
    expect(prompt).toMatch(/skein.*nøgle.*nøglen.*inflection/i);
    expect(prompt).toMatch(/pm.*preserve.*Placer markør/i);
    expect(prompt).toMatch(/sm.*fm.*Flyt markør/i);
    expect(prompt).toMatch(/right side.*retsiden.*wrong side.*vrangsiden/i);
    expect(prompt).toMatch(/Begynd at strikke.*Du vil begynde at strikke/i);
    expect(prompt).toMatch(/forstykket strikkes nu videre efter kropsdiagrammet/i);
    expect(prompt).toMatch(/Samling af forstykke/i);
    expect(prompt).toMatch(/do not inject.*English explanations.*translator notes/i);
    expect(prompt).toMatch(/Danish punctuation.*English comma patterns/i);
    expect(prompt).toMatch(/textual <th> and <td>.*data-o.*no data-seg/i);
  });

  it('gives the Danish QA pass explicit consistency and overlap checks', () => {
    const prompt = createDanishQaSystemInstruction('English');

    expect(prompt).toMatch(/pmsm.*tilpå.*repeated nouns.*doubled headings/i);
    expect(prompt).toMatch(/old and new text.*together/i);
    expect(prompt).toMatch(/every pm.*every sm.*source/i);
    expect(prompt).toMatch(/construction summary.*shoulders.*neckline.*sleeves.*glossary.*chart legend/i);
    expect(prompt).toMatch(/mixed-language parentheticals.*editing instructions/i);
    expect(prompt).toMatch(/natural Danish punctuation/i);
  });

  it('flags obvious Danish overlap, repetition, and mixed-language residue', () => {
    const html = `<div>
      <h2 data-o="Assembly">Samling</h2><h2 data-o="Assembly">Samling</h2>
      <p data-o="pm, knit to sm.">pmsm, strik tilpå markøren.</p>
      <p data-o="The stitches remain on hold.">Maskerne maskerne hviler fortsat (continue later). Translator note: check this.</p>
    </div>`;
    const blocks = extractDanishQaBlocks(html);

    expect(blocks[1].issues).toContain('DUPLICATE_HEADING');
    expect(blocks[2].issues).toEqual(expect.arrayContaining(['MERGED_TOKEN', 'MERGED_WORDS']));
    expect(blocks[3].issues).toEqual(expect.arrayContaining([
      'REPEATED_WORD',
      'MIXED_LANGUAGE_PARENTHETICAL',
      'EDITORIAL_NOTE',
    ]));

    const deduplicated = applyDanishQaRepairs(html, blocks, [{
      id: blocks[1].id,
      text: '',
      remove: true,
    }]);
    expect(deduplicated.match(/>Samling<\/h2>/g)).toHaveLength(1);
  });

  it('applies valid Danish QA repairs but rejects changed counts, units, or pm/sm mappings', () => {
    const html = `<div>
      <p data-o="pm, knit 8 cm to sm on Row 12.">pmsm, strik 8 cm til markøren på pind 12.</p>
    </div>`;
    const blocks = extractDanishQaBlocks(html);

    const repaired = applyDanishQaRepairs(html, blocks, [{
      id: 'da-qa-1',
      text: 'pm, strik 8 cm til fm på pind 12.',
      remove: false,
    }]);
    expect(repaired).toContain('>pm, strik 8 cm til fm på pind 12.</p>');

    const changedMeasurement = applyDanishQaRepairs(html, blocks, [{
      id: 'da-qa-1',
      text: 'pm, strik 9 cm til fm på pind 12.',
      remove: false,
    }]);
    expect(changedMeasurement).toBe(html);

    const swappedMarkers = applyDanishQaRepairs(html, blocks, [{
      id: 'da-qa-1',
      text: 'fm, strik 8 cm til pm på pind 12.',
      remove: false,
    }]);
    expect(swappedMarkers).toBe(html);
  });

  it('does not mistake the Danish stitch abbreviation m for a metre unit', () => {
    const html = '<p data-o="Knit 8 sts.">Du vil strikke 8 m.</p>';
    const blocks = extractDanishQaBlocks(html);

    expect(applyDanishQaRepairs(html, blocks, [{
      id: 'da-qa-1',
      text: 'Strik 8 m.',
      remove: false,
    }])).toContain('>Strik 8 m.</p>');
  });

  it.each([
    ['PDF', createSystemInstruction('Spanish', 'English')],
    ['document', createDocumentSystemInstruction('Spanish', 'English')],
  ])('includes the approved Spanish knitting terminology profile in the %s prompt', (_kind, prompt) => {
    expect(prompt).toMatch(/held double.*dos hebras juntas/i);
    expect(prompt).toMatch(/vest.*right sleeve.*sisa derecha.*armhole edging/i);
    expect(prompt).toMatch(/Italian bind-off.*tubular bind-off.*remate italiano.*en circular/i);
    expect(prompt).toMatch(/stitches reduced.*puntos disminuidos/i);
    expect(prompt).toMatch(/locking marker.*marcador con cierre/i);
    expect(prompt).toMatch(/RS facing.*con el LD de la labor hacia ti/i);
    expect(prompt).toMatch(/work chart accordingly.*trabaja el gráfico según corresponda/i);
    expect(prompt).toMatch(/blocking.*bloqueo.*pre-blocking.*bloqueo intermedio/i);
    expect(prompt).toMatch(/flat.*row.*fila.*round.*vuelta.*in the round/i);
    expect(prompt).toMatch(/BOR.*CV.*comienzo de vuelta/i);
    expect(prompt).toMatch(/agujas de mayor grosor.*agujas de menor grosor/i);
    expect(prompt).toMatch(/cabo suelto del hilo/i);
    expect(prompt).toMatch(/LD.*LR.*CV.*pts.*A1D.*A1I.*2pjD.*dm.*pm/i);
  });

  it('requires the Spanish QA pass to inspect construction context and size-specific references', () => {
    const prompt = createSpanishQaSystemInstruction('English');

    expect(prompt).toMatch(/worked flat.*fila.*worked in the round.*vuelta/i);
    expect(prompt).toMatch(/every row and round.*source construction context/i);
    expect(prompt).toMatch(/specific chart name and size/i);
    expect(prompt).toMatch(/como se indica arriba/i);
    expect(prompt).toMatch(/same number of sizes and measurements/i);
    expect(prompt).toMatch(/Markdown artefacts/i);
  });

  it('applies Spanish terminology repairs without changing measurements or protected abbreviations', () => {
    const html = `<div>
      <p data-o="Row 1: pm, knit 9.5 cm to sm at BOR; M1R, M1L, k2tog.">Vuelta 1: pm, teje 9.5cm hasta sm en BOR; Aum1D, Aum1I, 2pjD.</p>
    </div>`;
    const blocks = extractDanishQaBlocks(html);

    const repaired = applySpanishQaRepairs(html, blocks, [{
      id: 'da-qa-1',
      text: 'Fila 1: pm, teje 9,5 cm hasta dm en CV; A1D, A1I, 2pjD.',
      remove: false,
    }]);
    expect(repaired).toContain('>Fila 1: pm, teje 9,5 cm hasta dm en CV; A1D, A1I, 2pjD.</p>');

    const changedMeasurement = applySpanishQaRepairs(html, blocks, [{
      id: 'da-qa-1',
      text: 'Fila 1: pm, teje 10,5 cm hasta dm en CV; A1D, A1I, 2pjD.',
      remove: false,
    }]);
    expect(changedMeasurement).toBe(html);

    const swappedMarkers = applySpanishQaRepairs(html, blocks, [{
      id: 'da-qa-1',
      text: 'Fila 1: dm, teje 9,5 cm hasta pm en CV; A1D, A1I, 2pjD.',
      remove: false,
    }]);
    expect(swappedMarkers).toBe(html);
  });

  it.each([
    ['PDF', createSystemInstruction('French', 'English')],
    ['document', createDocumentSystemInstruction('French', 'English')],
  ])('includes the approved French knitting terminology profile in the %s prompt', (_kind, prompt) => {
    expect(prompt).toMatch(/l’ourlet.*la bordure/i);
    expect(prompt).toMatch(/explanatory prose.*maille.*not.*m/i);
    expect(prompt).toMatch(/knitting in the round.*tour/i);
    expect(prompt).toMatch(/pièce.*ouvrage.*partie du corps.*context/i);
    expect(prompt).toMatch(/aiguille à tapisserie.*aiguille à laine/i);
    expect(prompt).toMatch(/bord de montage.*rang de montage/i);
    expect(prompt).toMatch(/Passer aux aiguilles.*Prendre les aiguilles/i);
    expect(prompt).toMatch(/prébloquez.*pré-bloquez/i);
    expect(prompt).toMatch(/code QR.*QR code/i);
    expect(prompt).toMatch(/verrez.*trouverez.*utilise.*possède.*établi.*indiqué/i);
    expect(prompt).toMatch(/remesurer.*mesurer à nouveau/i);
    expect(prompt).toMatch(/le bon échantillon/i);
  });

  it('requires the French QA pass to compare complete segments and remove repetition', () => {
    const prompt = createFrenchQaSystemInstruction('English');

    expect(prompt).toMatch(/complete instructional sentences/i);
    expect(prompt).toMatch(/compare every translated segment.*English source/i);
    expect(prompt).toMatch(/missing articles.*nouns.*connectors/i);
    expect(prompt).toMatch(/duplicated glossary definitions.*repeated wording/i);
    expect(prompt).toMatch(/untranslated English notes/i);
    expect(prompt).toMatch(/terminology.*prose.*abbreviations.*glossary.*charts/i);
    expect(prompt).toMatch(/low-confidence terminology.*manual review/i);
  });

  it('treats imported human corrections as context-bound translation memory', () => {
    const prompt = createTranslationMemoryInstruction([{
      sourceLanguage: 'English',
      targetLanguage: 'French',
      sourceText: 'tapestry needle',
      targetText: 'aiguille à laine',
    }]);

    expect(prompt).toMatch(/human-approved corrections/i);
    expect(prompt).toMatch(/source phrase and knitting context match/i);
    expect(prompt).toContain('tapestry needle');
    expect(prompt).toContain('aiguille à laine');
    expect(prompt).toMatch(/do not copy unrelated numbers.*sizes.*row references/i);
  });
});
