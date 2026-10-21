import { describe, expect, it } from 'vitest';
import {
  collapseStrayBreakAfterHeading,
  expandSpanishK2togAbbreviation,
  findMarkdownArtifacts,
  normalizeSpanishMeasurementsInHtml,
  restoreFrenchRepeatAsterisksInHtml,
  restoreSourceInchStringsInHtml,
  sanitizeMarkdownArtifactsInHtml,
} from '../src/services/translationSanitizers';

describe('translation output sanitizers', () => {
  it('converts Markdown emphasis to HTML and removes literal Markdown syntax without touching attributes', () => {
    const html = '<p data-o="Keep **source** markdown">## **Nota:** Usa __el cabo__ y `pm`.</p>';
    const sanitized = sanitizeMarkdownArtifactsInHtml(html);

    expect(sanitized).toBe(
      '<p data-o="Keep **source** markdown"><strong>Nota:</strong> Usa <strong>el cabo</strong> y pm.</p>',
    );
    expect(findMarkdownArtifacts(sanitized)).toEqual([]);
  });

  it('keeps knitting repeat asterisks instead of turning them into emphasis', () => {
    const html = '<p>répéter de * à *; * k2tog, yo; repeat from *</p>';
    expect(sanitizeMarkdownArtifactsInHtml(html)).toBe(html);
  });

  it('restores dropped French repeat asterisks', () => {
    const html = '<p data-o="repeat from * to *">répéter de à, puis continuer.</p>';
    expect(restoreFrenchRepeatAsterisksInHtml(html)).toBe(
      '<p data-o="repeat from * to *">répéter de * à *, puis continuer.</p>',
    );
  });

  it('normalizes Spanish decimals, spacing, ranges, points, and inch notation in visible text only', () => {
    const html = '<p data-o="9.5 cm; 170m; 50g; 2pts; 8-10 cm; 3.25 in">9.5cm, 170m, 50g, 2pts, 8-10 cm, 1-3 meses, 3.25".</p>';
    const normalized = normalizeSpanishMeasurementsInHtml(html);

    expect(normalized).toContain('data-o="9.5 cm; 170m; 50g; 2pts; 8-10 cm; 3.25 in"');
    expect(normalized).toContain('9,5 cm, 170 m, 50 g, 2 pts, 8–10 cm, 1–3 meses, 3,25 in.');
  });

  it('does not change values, size count, or the source unit system', () => {
    const html = '<p>40-44 cm, 48-52 cm / 15.75-17.25 in, 18-20 in</p>';
    const normalized = normalizeSpanishMeasurementsInHtml(html);

    expect(normalized).toBe('<p>40–44 cm, 48–52 cm / 15,75–17,25 in, 18–20 in</p>');
    expect(normalized.match(/cm/g)).toHaveLength(2);
    expect(normalized.match(/in/g)).toHaveLength(2);
  });

  it('keeps the source inch symbol across a size run instead of mixing " and in', () => {
    const source = '36¼"-39⅜"-41¾"-45"-48"';
    const mixed = '36¼"-39⅜"-41¾"-45 in-48 in';
    const html = `<p data-o="${source.replaceAll('"', '&quot;')}">${mixed}</p>`;
    const normalized = normalizeSpanishMeasurementsInHtml(html);

    expect(normalized).toContain('36¼"-39⅜"-41¾"-45"-48"');
    expect(normalized).not.toMatch(/45 in/);
    expect(normalized).not.toMatch(/48 in/);
  });

  it('still converts leftover " to in when the source size run uses in', () => {
    const html = '<p data-o="Finished bust: 36.25 in-39.375 in-45 in">36¼"-39⅜"-45"</p>';
    const normalized = normalizeSpanishMeasurementsInHtml(html);
    expect(normalized).toContain('36¼ in-39⅜ in-45 in');
    expect(normalized).not.toMatch(/45"/);
  });

  it('copies source inch strings exactly and never converts vulgar fractions to decimals or in', () => {
    const source = 'Cuff: 2⅜&quot; and 3⅛&quot;';
    const corrupted = 'Puño: 2,375 in y 3,125 in';
    const html = `<p data-o="${source}">${corrupted}</p>`;
    const restored = restoreSourceInchStringsInHtml(
      normalizeSpanishMeasurementsInHtml(html),
    );

    expect(restored).toContain('2⅜"');
    expect(restored).toContain('3⅛"');
    expect(restored).not.toMatch(/2,375|2\.375|3,125|3\.125/);
    expect(restored).not.toMatch(/\bin\b/);
  });

  it('restores a hyphen-joined inch run that was decimalized', () => {
    const source = 'Yoke: 23-23-24-24-25-25 cm / 9-9-9½-9½-9¾-9¾&quot;';
    const html = `<p data-o="${source}">Canesú: 23-23-24-24-25-25 cm / 9-9-9.5-9.5-9.75-9.75 in</p>`;
    const restored = restoreSourceInchStringsInHtml(html);
    expect(restored).toContain('9-9-9½-9½-9¾-9¾"');
    expect(restored).not.toMatch(/9\.5|9,5|9\.75|9,75|\bin\b/);
  });

  it('collapses a stray blank after a CUERPO: heading before the stitch-count run', () => {
    const html = '<p>CUERPO:</p><p></p><p>192-208-224-240-256-272 pts</p>';
    expect(collapseStrayBreakAfterHeading(html)).toBe(
      '<p>CUERPO:</p><p>192-208-224-240-256-272 pts</p>',
    );
    expect(collapseStrayBreakAfterHeading(
      '<h2>CUERPO:</h2>\n<p><br></p>\n<p>192-208-224 pts</p>',
    )).toBe('<h2>CUERPO:</h2><p>192-208-224 pts</p>');
    expect(collapseStrayBreakAfterHeading(
      '<p>CUERPO:<br><br></p><p>192-208 pts</p>',
    )).toBe('<p>CUERPO:</p><p>192-208 pts</p>');
  });

  it('expands leftover Spanish 2pjD to the written-out k2tog form', () => {
    const html = '<p>Al disminuir, 2pjD en el marcador; luego 2pjD-ret.</p>';
    expect(expandSpanishK2togAbbreviation(html)).toBe(
      '<p>Al disminuir, teje 2 puntos juntos del derecho en el marcador; luego 2pjD-ret.</p>',
    );
  });
});
