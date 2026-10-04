import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const identity =
  'StitchSpeak is operated by Innovai Studio S.L., a company incorporated in Spain, with tax identification number B88686993, registered office at Carril la Resinera 74, and registered in the Mercantile Registry of Málaga, Hoja MA-198474, Inscripción 1ª. Contact: support@stitchspeak.com.';

const legalDir = dirname(fileURLToPath(import.meta.url));
const terms = readFileSync(join(legalDir, 'terms.html'), 'utf8');
const privacy = readFileSync(join(legalDir, 'privacy.html'), 'utf8');

describe('legal identity pages', () => {
  it('uses the locked short operator identity and omits withheld address fragments', () => {
    for (const page of [terms, privacy]) {
      expect(page).toContain(identity);
      expect(page).not.toContain('we will provide the applicable details');
      expect(page).not.toContain('Calle');
      expect(page).not.toContain('Bloque');
      expect(page).not.toContain('Estepona');
      expect(page).not.toContain('29680');
      expect(page).not.toContain('1º D');
    }
  });

  it('names PostHog in the privacy subprocessors section', () => {
    expect(privacy).toContain('<h2>9. Sharing and subprocessors</h2>');
    expect(privacy).toContain('PostHog (EU, eu.i.posthog.com)');
    expect(privacy).toContain('Last updated: October 4, 2026');
  });
});
