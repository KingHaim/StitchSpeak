import { describe, expect, it } from 'vitest';
import {
  annotateSourceTopology,
  applyInnerHtmlBySourceId,
  auditTranslatedTopology,
  flattenRedundantInnerParagraphs,
  projectTranslationOntoSource,
  restoreSourceHeadingLevels,
  translatedContainsSourceText,
} from '../src/services/translationTopology';

describe('translation topology', () => {
  it('assigns stable ids to every paragraph, list item, heading, and table cell, including empty paragraphs', () => {
    const source = `<div>
      <h2>Materials Needed</h2>
      <p></p>
      <p>Video description<br>https://example.com<br>Scan the QR code.</p>
      <ul><li>First level<ul><li>Nested level</li></ul></li></ul>
      <table><tr><th>Size</th><td>Newborn</td></tr></table>
    </div>`;
    const annotated = annotateSourceTopology(source);

    expect(annotated).toContain('<h2 data-source-id="src-1">Materials Needed</h2>');
    expect(annotated).toContain('<p data-source-id="src-2"></p>');
    expect(annotated).toContain('<p data-source-id="src-3">Video description<br>https://example.com<br>Scan the QR code.</p>');
    expect(annotated).toContain('<li data-source-id="src-4">');
    expect(annotated).toContain('<li data-source-id="src-5">Nested level</li>');
    expect(annotated).toContain('<th data-source-id="src-6">Size</th>');
    expect(annotated).toContain('<td data-source-id="src-7">Newborn</td>');
  });

  it('reports missing, extra, reordered, split-line, page-break, tag, and list-level damage', () => {
    const source = annotateSourceTopology(`<div>
      <h2>Left shoulder</h2>
      <p>Setup round 1<br>Setup round 2</p>
      <p style="page-break-before: always"></p>
      <ul><li>Nested instruction</li></ul>
      <table><tr><td>Chart label</td></tr></table>
    </div>`);
    const damaged = `<div>
      <p data-source-id="src-1">Hombro izquierdo</p>
      <p data-source-id="src-2">Vuelta de preparación 1 y 2</p>
      <p data-source-id="src-3"></p>
      <p data-source-id="src-4">Instrucción</p>
      <td data-source-id="src-5">Etiqueta</td>
      <p data-source-id="src-99">Extra</p>
    </div>`;

    const codes = auditTranslatedTopology(source, damaged).map((warning) => warning.code);
    expect(codes).toEqual(expect.arrayContaining([
      'TAG_CHANGED',
      'MANUAL_BREAK_CHANGED',
      'PAGE_BREAK_CHANGED',
      'LIST_LEVEL_CHANGED',
      'EXTRA_ELEMENT',
    ]));
  });

  it('reports missing and reordered source ids without guessing a structural repair', () => {
    const source = annotateSourceTopology('<div><p>One</p><p>Two</p><p>Three</p></div>');
    const translated = '<div><p data-source-id="src-3">Tres</p><p data-source-id="src-1">Uno</p></div>';
    const warnings = auditTranslatedTopology(source, translated);

    expect(warnings.some((warning) => warning.code === 'MISSING_ELEMENT' && warning.sourceId === 'src-2')).toBe(true);
    expect(warnings.some((warning) => warning.code === 'ORDER_CHANGED')).toBe(true);
  });

  it('unwraps a single mammoth paragraph inside a table cell and ids only the cell', () => {
    const source = annotateSourceTopology('<table><tr><td><p>Nested text</p></td></tr></table>');

    expect(source).toContain('<td data-source-id="src-1">Nested text</td>');
    expect(source).not.toContain('data-source-id="src-2"');
    expect(source).not.toContain('<p>');
  });

  it('keeps two real paragraphs inside a cell as separate leaf ids', () => {
    const annotated = annotateSourceTopology('<table><tr><td><p>First</p><p>Second</p></td></tr></table>');

    expect(annotated).toContain('<p data-source-id="src-1">First</p>');
    expect(annotated).toContain('<p data-source-id="src-2">Second</p>');
    expect(annotated).not.toMatch(/<td data-source-id=/);
  });

  it('does not treat flattened cell text as missing when the model keeps only the td', () => {
    const source = annotateSourceTopology(
      '<table><tr><td><p>About 500, 500, 500 yards</p></td><td><p>Size S</p></td></tr></table>',
    );
    const translated = source
      .replace('About 500, 500, 500 yards', 'Environ 500, 500, 500 mètres')
      .replace('Size S', 'Taille S');

    const warnings = auditTranslatedTopology(source, translated);
    expect(warnings.some((warning) => warning.code === 'MISSING_ELEMENT')).toBe(false);
  });

  it('restores source heading tags when the translator demotes them', () => {
    const source = annotateSourceTopology('<div><h1>Seaside Pullover</h1><h2>Materials</h2><h1>Body</h1></div>');
    const demoted = '<div>'
      + '<h2 data-source-id="src-1">Seaside Pullover</h2>'
      + '<h2 data-source-id="src-2">Materials</h2>'
      + '<h2 data-source-id="src-3">Body</h2>'
      + '</div>';
    const restored = restoreSourceHeadingLevels(source, demoted);

    expect(restored).toContain('<h1 data-source-id="src-1">Seaside Pullover</h1>');
    expect(restored).toContain('<h2 data-source-id="src-2">Materials</h2>');
    expect(restored).toContain('<h1 data-source-id="src-3">Body</h1>');
    expect(auditTranslatedTopology(source, restored).some((warning) => warning.code === 'TAG_CHANGED')).toBe(false);
  });

  it('projects translated inners onto the source skeleton so omitted ids are not lost', () => {
    const source = annotateSourceTopology('<div><p>One</p><p>Two</p><p>Three</p></div>');
    const translated = '<div><p data-source-id="src-1">Uno</p><p data-source-id="src-3">Tres</p></div>';
    const projected = projectTranslationOntoSource(source, translated);

    expect(projected.omittedIds).toEqual(['src-2']);
    expect(projected.html).toContain('data-source-id="src-2"');
    expect(projected.html).toContain('Uno');
    expect(projected.html).toContain('Tres');

    const repaired = applyInnerHtmlBySourceId(projected.html, new Map([['src-2', 'Dos']]), source);
    expect(repaired).toContain('>Dos<');
    expect(auditTranslatedTopology(source, repaired).some((warning) => warning.code === 'MISSING_ELEMENT')).toBe(false);
  });

  it('does not treat identical English copy-through as a present translation', () => {
    expect(translatedContainsSourceText(
      { innerHtml: 'Work the lace panel.' },
      [{ innerHtml: 'Work the lace panel.' }],
    )).toBe(false);
    expect(translatedContainsSourceText(
      { innerHtml: 'Work the lace panel.' },
      [{ innerHtml: 'Tricoter le panneau. Work the lace panel.' }],
    )).toBe(true);

    const source = annotateSourceTopology('<div><p>One</p><p>Work the lace panel.</p></div>');
    const copied = '<div><p data-source-id="src-1">Work the lace panel.</p></div>';
    const warnings = auditTranslatedTopology(source, copied);
    expect(warnings.some((warning) => warning.code === 'MISSING_ELEMENT' && warning.sourceId === 'src-2')).toBe(true);
  });

  it('escapes plain-text omitted-segment repairs before inserting them', () => {
    const source = annotateSourceTopology('<div><p>One</p><p>Two</p></div>');
    const projected = projectTranslationOntoSource(
      source,
      '<div><p data-source-id="src-1">Uno</p></div>',
    );
    const repaired = applyInnerHtmlBySourceId(
      projected.html,
      new Map([['src-2', 'Cast on 3 < 5 sts & knit']]),
      source,
    );
    expect(repaired).toContain('Cast on 3 &lt; 5 sts &amp; knit');
    expect(repaired).not.toContain('3 < 5');
  });

  it('flattens only a lone inner paragraph', () => {
    expect(flattenRedundantInnerParagraphs('<li><p>Work even</p></li>')).toBe('<li>Work even</li>');
    expect(flattenRedundantInnerParagraphs('<li><p>A</p><p>B</p></li>')).toBe('<li><p>A</p><p>B</p></li>');
  });
});
