import { describe, expect, it } from 'vitest';
import {
  extractYarnColourNames,
  restoreYarnColourNamesInHtml,
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
    const restored = restoreYarnColourNamesInHtml(html);

    expect(restored).toContain('Coffee (color 8903)');
    expect(restored).toContain('Cherry Jam (color 3608)');
    expect(restored).toContain('Teje Coffee hasta el marcador.');
    expect(restored).toContain('Clave: Cherry Jam');
    expect(restored).toContain('Rust (color 0504)');
    expect(restored).toContain('Moss Green (color 7238)');
    expect(restored).toContain('Olive Oil (color 7230)');
    expect(restored).not.toMatch(/Café|Mermelada|Óxido|Verde musgo|Aceite de oliva/);
  });

  it('tells the model to keep source colour product names', () => {
    expect(yarnColourPromptRule([])).toMatch(/Coffee, Cherry Jam, Rust, Moss Green, Olive Oil/);
    expect(yarnColourPromptRule([])).toMatch(/Never translate them/);
  });
});
