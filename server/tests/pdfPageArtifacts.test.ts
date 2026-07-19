import { describe, expect, it } from 'vitest';
import {
  buildPdfPageArtifactInstruction,
  detectPdfPageArtifactsFromPages,
  removePdfPageArtifacts,
} from '../src/services/pdfPageArtifacts';

function textLine(page: number, y: number, text: string) {
  return {
    str: text,
    x: 72,
    y,
    width: text.length * 6,
    font: { size: 10 },
    page,
  };
}

function page(num: number, content: ReturnType<typeof textLine>[]) {
  return {
    info: { num, height: 800 },
    content,
  };
}

describe('PDF page artifact filtering', () => {
  it('detects repeated margin headers, footers, hashtags, and page numbers', () => {
    const profile = detectPdfPageArtifactsFromPages([
      page(1, [
        textLine(1, 778, 'Anleitung von @Knitting_with_calm'),
        textLine(1, 762, '#NaturaTop'),
        textLine(1, 405, 'Mit Bündchen:'),
        textLine(1, 18, '1'),
      ]),
      page(2, [
        textLine(2, 778, 'Anleitung von @Knitting_with_calm'),
        textLine(2, 762, '#NaturaTop'),
        textLine(2, 407, 'Zu größeren Nadeln wechseln'),
        textLine(2, 18, '2'),
      ]),
    ]);

    expect(profile.phrases).toEqual(expect.arrayContaining([
      'Anleitung von @Knitting_with_calm',
      '#NaturaTop',
      '1',
      '2',
    ]));
    expect(profile.phrases).toHaveLength(4);
    expect(profile.phrases).not.toContain('Mit Bündchen:');
    expect(profile.phrases).not.toContain('Zu größeren Nadeln wechseln');
  });

  it('builds a prompt guard and removes emitted artifact blocks from HTML', () => {
    const profile = {
      phrases: [
        'Pattern by @Knitting_with_calm',
        '#NaturaTop',
        '2',
      ],
    };

    const instruction = buildPdfPageArtifactInstruction(profile);
    expect(instruction).toContain('PDF PAGE ARTIFACTS TO OMIT');
    expect(instruction).toContain('Pattern by @Knitting_with_calm');

    const cleaned = removePdfPageArtifacts(
      `<div>
        <p data-seg="1" data-o="Cast on with smaller needles.">Mit kleineren Nadeln anschlagen.</p>
        <p data-seg="2" data-o="Pattern by @Knitting_with_calm">Anleitung von @Knitting_with_calm</p>
        <p data-seg="3" data-o="#NaturaTop">#NaturaTop</p>
        <p data-seg="4" data-o="2">2</p>
        <p>[IMG_1]</p>
        <p data-seg="5" data-o="Switch to larger needles.">Zu größeren Nadeln wechseln.</p>
      </div>`,
      profile,
    );

    expect(cleaned).toContain('Mit kleineren Nadeln anschlagen.');
    expect(cleaned).not.toContain('Anleitung von @Knitting_with_calm');
    expect(cleaned).not.toContain('#NaturaTop');
    expect(cleaned).not.toContain('data-o="2"');
    expect(cleaned).toContain('<p>[IMG_1]</p>');
    expect(cleaned).toContain('Zu größeren Nadeln wechseln.');
  });
});
