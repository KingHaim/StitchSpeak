// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TranslationPreviewLock, UNLOCK_TRANSLATION_LINE } from './TranslationPreviewLock';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

describe('TranslationPreviewLock', () => {
  it('shows exactly one unlock line plus the remaining-cost estimate, and no AI wording', async () => {
    const onUnlock = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <TranslationPreviewLock remainingCost={6.5} fullCost={8.5} onUnlock={onUnlock} />,
      );
    });

    const lock = container.querySelector('[data-testid="translation-preview-lock"]');
    expect(lock?.textContent).toContain(UNLOCK_TRANSLATION_LINE);
    expect(lock?.querySelectorAll('button')).toHaveLength(1);
    expect(lock?.querySelector('button')?.textContent).toBe(UNLOCK_TRANSLATION_LINE);
    expect(lock?.textContent).toContain('Translation estimate: 6.5 credits');
    expect(lock?.textContent).not.toContain('8.5');
    expect(lock?.textContent).not.toMatch(/\bAI\b/i);
    expect(lock?.textContent).not.toContain('Next section');

    await act(async () => {
      lock?.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it('shows payment polling copy instead of a dead end', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <TranslationPreviewLock waitingForCredits onUnlock={() => undefined} />,
      );
    });
    expect(container.textContent).toContain('Payment received, adding credits…');
    expect(container.querySelector('button')).toBeNull();
  });
});
