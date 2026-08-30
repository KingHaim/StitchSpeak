import { describe, expect, it } from 'vitest';
import {
  findMarkdownArtifacts,
  normalizeSpanishMeasurementsInHtml,
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
});
