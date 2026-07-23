// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LandingPage } from './LandingPage';

vi.mock('../AuthDialog', () => ({
  AuthDialog: () => null,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  window.history.replaceState({}, '', '/');
  localStorage.clear();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('LandingPage FAQ', () => {
  it('answers the practical questions that affect purchase and publishing decisions', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<LandingPage />);
    });

    const faq = container.querySelector('#faq');
    expect(faq).not.toBeNull();
    expect(faq?.querySelectorAll('details')).toHaveLength(8);
    expect(faq?.textContent).toContain('How is a translation priced?');
    expect(faq?.textContent).toContain('What happens if a translation fails?');
    expect(faq?.textContent).toContain('Will the translated file look exactly like my original?');
    expect(faq?.textContent).toContain('Built for patterns. Still reviewed by you.');
    expect(faq?.textContent).not.toContain('Is StitchSpeak free?');
    expect(faq?.textContent).not.toMatch(/\bAI\b|Gemini/i);
  });

  it('restores the website language and translates the landing page copy', async () => {
    localStorage.setItem('stitchspeak_website_language', 'es');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<LandingPage />);
    });

    expect(document.documentElement.lang).toBe('es');
    expect(container.querySelector('[aria-label="Idioma de la web"]')).not.toBeNull();
    expect(container.textContent).toContain('Tus patrones,');
    expect(container.textContent).toContain('¿Cómo se calcula el precio de una traducción?');
    expect(container.textContent).toContain('Empezar a traducir');
  });
});
