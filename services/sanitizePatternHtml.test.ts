// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { sanitizePatternHtml } from './sanitizePatternHtml';

describe('sanitizePatternHtml', () => {
  it('removes executable markup and dangerous URLs', () => {
    const html = sanitizePatternHtml(`
      <div>
        <script>alert('x')</script>
        <img src="x" onerror="alert('x')" />
        <a href="javascript:alert('x')" onclick="alert('x')">bad link</a>
        <p style="background-image: url(javascript:alert('x')); color: #333;">Text</p>
      </div>
    `);

    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('background-image');
    expect(html).toContain('color: #333');
  });

  it('preserves pattern structure, alignment data, images, and safe table styles', () => {
    const html = sanitizePatternHtml(`
      <h1 data-seg="1" data-o="Cast on" style="font-family: Georgia, serif; font-size: 1.6em;">Montar</h1>
      <table style="width: 100%; border-collapse: collapse;">
        <tbody>
          <tr>
            <td style="padding: 0.4em; text-align: center;">Size</td>
          </tr>
        </tbody>
      </table>
      <img src="data:image/png;base64,abc" alt="chart" loading="lazy">
    `);

    expect(html).toContain('data-seg="1"');
    expect(html).toContain('data-o="Cast on"');
    expect(html).toContain('font-family: Georgia, serif');
    expect(html).toContain('border-collapse: collapse');
    expect(html).toContain('padding: 0.4em');
    expect(html).toContain('src="data:image/png;base64,abc"');
  });
});

