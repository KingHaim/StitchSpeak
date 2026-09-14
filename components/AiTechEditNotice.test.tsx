// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { AiTechEditNotice, AI_TECH_EDIT_NOTICE } from './AiTechEditNotice';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

describe('AiTechEditNotice', () => {
  it('pins the Patterns-locked disclaimer copy verbatim', () => {
    expect(AI_TECH_EDIT_NOTICE).toBe(
      'This is an automated draft translation, not a published tech edit. Number and glossary checks are automated — have a human tech editor review the pattern before publication.',
    );
  });

  it('renders the locked copy with no user-visible "AI" wording', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<AiTechEditNotice />);
    });

    const notice = container.querySelector('[data-testid="ai-tech-edit-notice"]');
    expect(notice?.textContent).toContain(AI_TECH_EDIT_NOTICE);
    expect(notice?.textContent).not.toMatch(/\bAI\b/);
  });
});
