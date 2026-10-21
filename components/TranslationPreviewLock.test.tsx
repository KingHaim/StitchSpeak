// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatUnlockConfirm } from '../utils/unlockConfirm';
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
  it('shows exactly one unlock line plus the full-job unlock price, and no AI wording', async () => {
    const onUnlock = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <TranslationPreviewLock remainingCost={6.5} fullCost={6.5} onUnlock={onUnlock} />,
      );
    });

    const lock = container.querySelector('[data-testid="translation-preview-lock"]');
    expect(lock?.textContent).toContain(UNLOCK_TRANSLATION_LINE);
    expect(lock?.querySelectorAll('button')).toHaveLength(1);
    expect(lock?.querySelector('button')?.textContent).toBe(UNLOCK_TRANSLATION_LINE);
    expect(lock?.textContent).toContain('Translation estimate: 6.5 credits');
    expect(lock?.textContent).not.toMatch(/\bAI\b/i);
    expect(lock?.textContent).not.toContain('Next section');

    await act(async () => {
      lock?.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it('shows the full-job price even if remainingCost still holds a discounted remainder', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <TranslationPreviewLock remainingCost={0.5} fullCost={6.5} onUnlock={() => undefined} />,
      );
    });
    expect(container.textContent).toContain('Translation estimate: 6.5 credits');
    expect(container.textContent).not.toContain('0.5');
  });

  it('asks to confirm with the quoted cost and balance after before charging', async () => {
    const onUnlock = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <TranslationPreviewLock
          remainingCost={6.5}
          fullCost={6.5}
          balance={20}
          onUnlock={onUnlock}
        />,
      );
    });

    const lock = container.querySelector('[data-testid="translation-preview-lock"]');
    await act(async () => {
      lock?.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onUnlock).not.toHaveBeenCalled();

    const dialog = container.querySelector('[data-testid="unlock-confirm-dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain(formatUnlockConfirm(6.5, 20));
    expect(dialog?.textContent).toContain('Unlock full translation for 6.5 credits? Balance 20.0 → 13.5');
    expect(dialog?.textContent).not.toMatch(/\bAI\b/i);

    const confirmButtons = Array.from(dialog?.querySelectorAll('button') ?? []);
    expect(confirmButtons.map((button) => button.textContent)).toEqual(['Cancel', 'Unlock']);

    await act(async () => {
      confirmButtons.find((button) => button.textContent === 'Cancel')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('[data-testid="unlock-confirm-dialog"]')).toBeNull();
    expect(onUnlock).not.toHaveBeenCalled();
  });

  it('disables Unlock while the request is in flight so a double tap cannot fire twice', async () => {
    const onUnlock = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <TranslationPreviewLock
          remainingCost={6.5}
          fullCost={6.5}
          balance={20}
          onUnlock={onUnlock}
        />,
      );
    });

    const lock = container.querySelector('[data-testid="translation-preview-lock"]');
    await act(async () => {
      lock?.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const dialog = container.querySelector('[data-testid="unlock-confirm-dialog"]');
    const unlockButton = Array.from(dialog?.querySelectorAll('button') ?? [])
      .find((button) => button.textContent === 'Unlock');
    expect(unlockButton).toBeTruthy();

    await act(async () => {
      unlockButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      unlockButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onUnlock).toHaveBeenCalledTimes(1);
    expect(unlockButton?.disabled).toBe(true);
  });

  it('skips the confirm step when the balance cannot cover the quoted cost', async () => {
    const onUnlock = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <TranslationPreviewLock remainingCost={6.5} fullCost={6.5} balance={0} onUnlock={onUnlock} />,
      );
    });

    await act(async () => {
      container?.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container?.querySelector('[data-testid="unlock-confirm-dialog"]')).toBeNull();
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
