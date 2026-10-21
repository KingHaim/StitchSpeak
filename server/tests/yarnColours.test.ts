import { describe, expect, it } from 'vitest';
import {
  extractYarnColourNames,
  restoreYarnColourNamesInHtml,
  translatedNameForNumber,
  yarnColourPromptRule,
} from '../src/services/yarnColours';

describe('yarn colour product names', () => {
  it('detects colour name + number pairs from a materials list', () => {
    const source = [
      'Yarn A: DROPS Nepal, Coffee (colour 8903)',
      'Yarn B: colour no. 3608 Cherry Jam',
      'Yarn C: Rust (colour 0504)',
      'Yarn D: colour 7238, Moss Green',
      'Yarn E: Olive Oil (col. 7230)',
    ].join('\n');

    expect(extractYarnColourNames(source)).toEqual([
      { name: 'Coffee', number: '8903' },
      { name: 'Rust', number: '0504' },
      { name: 'Olive Oil', number: '7230' },
      { name: 'Cherry Jam', number: '3608' },
      { name: 'Moss Green', number: '7238' },
    ]);
  });

  it('restores source colour names in the yarn list, instructions, and chart key', () => {
    const html = `
      <p data-o="Yarn A: Coffee (colour 8903)">Hilo A: Café (color 8903)</p>
      <p data-o="Yarn B: Cherry Jam (colour 3608)">Hilo B: Mermelada de cereza (color 3608)</p>
      <p data-o="Work Coffee to the marker.">Teje Café hasta el marcador.</p>
      <td data-o="Chart key: Cherry Jam">Clave: Mermelada de cereza</td>
      <p data-o="Yarn C: Rust (colour 0504)">Hilo C: Óxido (color 0504)</p>
      <p data-o="Yarn D: Moss Green (colour 7238)">Hilo D: Verde musgo (color 7238)</p>
      <p data-o="Yarn E: Olive Oil (colour 7230)">Hilo E: Aceite de oliva (color 7230)</p>
    `;
    const { html: restored, reviewWarnings } = restoreYarnColourNamesInHtml(html);

    expect(restored).toContain('Coffee (color 8903)');
    expect(restored).toContain('Cherry Jam (color 3608)');
    expect(restored).toContain('Teje Coffee hasta el marcador.');
    expect(restored).toContain('Clave: Cherry Jam');
    expect(restored).toContain('Rust (color 0504)');
    expect(restored).toContain('Moss Green (color 7238)');
    expect(restored).toContain('Olive Oil (color 7230)');
    expect(restored).not.toMatch(/Café|Mermelada|Óxido|Verde musgo|Aceite de oliva/);
    expect(reviewWarnings).toEqual([]);
  });

  it('tells the model to keep source colour product names', () => {
    expect(yarnColourPromptRule([])).toMatch(/Coffee, Cherry Jam, Rust, Moss Green, Olive Oil/);
    expect(yarnColourPromptRule([])).toMatch(/Never translate them/);
  });

  it('does not treat DROPS yarn-list wording as the colour name', () => {
    const source = [
      'Yarn A: DROPS Air from Garnstudio (belongs to yarn group C)',
      '150-150-200 g colour 23, Coffee',
    ].join('\n');
    const translated = [
      'DROPS AIR de Garnstudio (pertenece al grupo de hilos C)',
      '150-150-200 g color 23, mezcla café',
    ].join('\n');
    const html = `
      <p data-o="${source}">${translated}</p>
      <p data-o="Work Coffee to the marker.">Teje mezcla café hasta el marcador.</p>
    `;
    const { html: restored, reviewWarnings } = restoreYarnColourNamesInHtml(html);

    expect(restored).toContain('DROPS AIR de Garnstudio (pertenece al grupo de hilos C)');
    expect(restored).toContain('150-150-200 g color 23, Coffee');
    expect(restored).toContain('Teje Coffee hasta el marcador.');
    expect(restored).not.toContain('mezcla café');
    expect(reviewWarnings).toEqual([]);
  });

  it('replaces only the yarn-list name café inside instruction text', () => {
    expect(translatedNameForNumber('color 08, café', '08')).toBe('café');

    const html = `
      <p data-o="Yarn A: Coffee (colour 08)">color 08, café</p>
      <p data-o="Work Coffee for the body.">color 08, café para el cuerpo</p>
      <p data-o="Work Coffee for the body.">Teje café para el cuerpo.</p>
    `;
    const { html: restored, reviewWarnings } = restoreYarnColourNamesInHtml(html);
    expect(restored).toContain('color 08, Coffee');
    expect(restored).toContain('color 08, Coffee para el cuerpo');
    expect(restored).toContain('Teje Coffee para el cuerpo.');
    expect(restored).toContain('para el cuerpo');
    expect(restored).not.toContain('café para el cuerpo');
    expect(reviewWarnings).toEqual([]);
  });

  it('leaves an ambiguous yarn-list colour name unchanged and warns', () => {
    expect(translatedNameForNumber('hilo DROPS Air Café (color 08)', '08')).toBe('hilo DROPS Air Café');

    const html = `
      <p data-seg="4" data-o="Yarn A: Coffee (colour 08)">hilo DROPS Air Café (color 08)</p>
      <p data-o="Work Coffee to the marker.">Teje Café hasta el marcador.</p>
    `;
    const { html: restored, reviewWarnings } = restoreYarnColourNamesInHtml(html);
    expect(restored).toContain('hilo DROPS Air Café (color 08)');
    expect(restored).toContain('Teje Café hasta el marcador.');
    expect(restored).not.toContain('hilo DROPS Air Coffee');
    expect(reviewWarnings).toHaveLength(1);
    expect(reviewWarnings[0].code).toBe('YARN_COLOUR_UNRESTORABLE');
    expect(reviewWarnings[0].sourceId).toBe('seg-4');
    expect(reviewWarnings[0].message).toMatch(/colour name for 08 could not be restored automatically/i);
    expect(reviewWarnings[0].message).not.toMatch(/\bAI\b/);
    expect(reviewWarnings[0].message).toMatch(/original pattern/);
  });

  it('replaces whole multi-word colour names from the materials list', () => {
    expect(translatedNameForNumber(
      '50-50-50-50-50-100-100 g color 20, Mermelada de cereza',
      '20',
    )).toBe('Mermelada de cereza');
    expect(translatedNameForNumber('color 7230, Aceite de oliva', '7230')).toBe('Aceite de oliva');
    expect(translatedNameForNumber('color 7238, Verde musgo', '7238')).toBe('Verde musgo');

    const html = `
      <p data-o="Yarn B: 50-50-50-50-50-100-100 g colour 20, Cherry Jam">
        50-50-50-50-50-100-100 g color 20, Mermelada de cereza
      </p>
      <p data-o="Yarn E: Olive Oil (colour 7230)">Hilo E: Aceite de oliva (color 7230)</p>
      <p data-o="Yarn D: Moss Green (colour 7238)">Hilo D: Verde musgo (color 7238)</p>
      <p data-o="Work Cherry Jam to the marker.">Teje Mermelada de cereza hasta el marcador.</p>
    `;
    const { html: restored, reviewWarnings } = restoreYarnColourNamesInHtml(html);

    expect(restored).toContain('50-50-50-50-50-100-100 g color 20, Cherry Jam');
    expect(restored).toContain('Olive Oil (color 7230)');
    expect(restored).toContain('Moss Green (color 7238)');
    expect(restored).toContain('Teje Cherry Jam hasta el marcador.');
    expect(restored).not.toContain('Mermelada de cereza');
    expect(restored).not.toContain('Cherry Jam de cereza');
    expect(restored).not.toContain('Aceite de oliva');
    expect(restored).not.toContain('de oliva');
    expect(restored).not.toContain('Aceite de Olive Oil');
    expect(restored).not.toContain('Verde musgo');
    expect(reviewWarnings).toEqual([]);
  });
});
