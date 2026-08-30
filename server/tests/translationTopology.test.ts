import { describe, expect, it } from 'vitest';
import {
  annotateSourceTopology,
  auditTranslatedTopology,
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

  it('audits nested paragraphs inside table cells and detects new elements without ids', () => {
    const source = annotateSourceTopology('<table><tr><td><p>Nested text</p></td></tr></table>');
    const target = source.replace('Nested text', 'Texte traduit')
      .replace('</td>', '<p>Injected paragraph</p></td>');
    const warnings = auditTranslatedTopology(source, target);

    expect(source).toContain('data-source-id="src-1"');
    expect(source).toContain('data-source-id="src-2"');
    expect(warnings.some((warning) => warning.code === 'EXTRA_ELEMENT')).toBe(true);
    expect(warnings.some(
      (warning) => warning.code === 'MISSING_ELEMENT' && warning.sourceId === 'src-2',
    )).toBe(false);
  });
});
