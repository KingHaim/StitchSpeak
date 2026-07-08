// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { TranslationLanguageModal } from './TranslationLanguageModal';
import { AUTO_DETECT_LANGUAGE, LANGUAGES } from '../constants';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;

afterEach(() => {
  container?.remove();
  container = null;
});

describe('TranslationLanguageModal authentication action', () => {
  it('shows a sign-in action instead of a dead translation button for guests', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <TranslationLanguageModal
          isOpen
          fileNames={['pattern.pdf']}
          isAnalyzing={false}
          analyzeError={null}
          pdfMetrics={null}
          priceEstimate={null}
          sourceLanguage={AUTO_DETECT_LANGUAGE}
          targetLanguage={LANGUAGES[0]}
          onSourceChange={() => undefined}
          onTargetChange={() => undefined}
          onClose={() => undefined}
          onStart={() => undefined}
          startLabel="Start translation"
          startDisabled={false}
          requiresSignIn
          googleIdentityReady
        />,
      );
    });

    expect(container.textContent).toContain('Sign in to continue');
    expect(container.textContent).not.toContain('Please sign in to translate patterns.');

    await act(async () => root.unmount());
  });

  it('requires the AI-processing acknowledgement before translation', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <TranslationLanguageModal
          isOpen fileNames={['pattern.pdf']} isAnalyzing={false} analyzeError={null}
          pdfMetrics={null} priceEstimate={null} sourceLanguage={AUTO_DETECT_LANGUAGE}
          targetLanguage={LANGUAGES[0]} onSourceChange={() => undefined}
          onTargetChange={() => undefined} onClose={() => undefined} onStart={() => undefined}
          startLabel="Start translation" startDisabled={false} requiresSignIn={false}
          googleIdentityReady
        />,
      );
    });
    const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    const start = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.includes('Start translation'))!;
    expect(start.disabled).toBe(true);
    await act(async () => {
      checkbox.click();
    });
    expect(start.disabled).toBe(false);
    await act(async () => root.unmount());
  });
});
