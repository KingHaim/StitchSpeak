// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { hasAlignment, synthesizeAlignment } from './alignment';

describe('synthesizeAlignment', () => {
  it('pairs translated blocks with the original text at the same position', () => {
    const original = '<h1>Hat</h1><p>Cast on 20 stitches.</p><p>Knit 10 rows.</p>';
    const translated = '<h1>Gorro</h1><p>Monta 20 puntos.</p><p>Teje 10 vueltas.</p>';

    const result = synthesizeAlignment(original, translated);
    expect(result).not.toBeNull();
    expect(hasAlignment(result!)).toBe(true);

    const root = document.createElement('div');
    root.innerHTML = result!;
    const blocks = Array.from(root.querySelectorAll('[data-seg]'));

    expect(blocks).toHaveLength(3);
    expect(blocks[0].getAttribute('data-o')).toBe('Hat');
    expect(blocks[0].textContent).toBe('Gorro');
    expect(blocks[1].getAttribute('data-o')).toBe('Cast on 20 stitches.');
    expect(blocks[1].textContent).toBe('Monta 20 puntos.');
    expect(blocks[2].getAttribute('data-o')).toBe('Knit 10 rows.');
    expect(blocks[2].textContent).toBe('Teje 10 vueltas.');
  });

  it('keeps the mapping monotonic when block counts differ', () => {
    const original =
      '<p>First instruction line.</p><p>Second instruction line, quite a bit longer than the rest.</p>';
    const translated =
      '<p>Primera línea.</p><p>Segunda línea, bastante más larga que el resto del texto aquí.</p><p>Extra dividida.</p>';

    const result = synthesizeAlignment(original, translated);
    expect(result).not.toBeNull();

    const root = document.createElement('div');
    root.innerHTML = result!;
    const originals = Array.from(root.querySelectorAll('[data-seg]')).map(
      (el) => el.getAttribute('data-o'),
    );

    expect(originals[0]).toBe('First instruction line.');
    expect(originals[originals.length - 1]).toBe(
      'Second instruction line, quite a bit longer than the rest.',
    );
  });

  it('returns null when either side has no text blocks', () => {
    expect(synthesizeAlignment('', '<p>Hola</p>')).toBeNull();
    expect(synthesizeAlignment('<p>Hi</p>', '<div></div>')).toBeNull();
  });
});
