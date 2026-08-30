// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TechEditReportView } from './TechEditReportView';
import type { TechEditReport } from '../types';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  vi.clearAllMocks();
});

const report: TechEditReport = {
  patternTitle: 'Flat Cardigan',
  language: 'English',
  summary: 'One terminology issue was found.',
  stats: {
    checksRun: 1,
    sizesChecked: 1,
    findingCounts: { critical: 0, warning: 1, suggestion: 0 },
  },
  findings: [
    {
      category: 'consistency',
      severity: 'warning',
      verified: false,
      location: 'Back — page 4',
      title: "Incorrect use of 'round' when working flat",
      detail: "The instruction says 'end of the round' in a section worked flat.",
      suggestion: "Change 'end of the round' to 'end of the row'.",
    },
  ],
};

describe('TechEditReportView finding questions', () => {
  it('loads and submits a focused paid question inline', async () => {
    const loadQuestions = vi.fn().mockResolvedValue([]);
    const askFinding = vi.fn().mockResolvedValue([
      { id: 1, role: 'user', content: 'Why is round wrong?', createdAt: 1 },
      { id: 2, role: 'model', content: 'Flat knitting is worked in rows.', createdAt: 2 },
    ]);

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <TechEditReportView
          report={report}
          fileName="cardigan.pdf"
          onLoadFindingQuestions={loadQuestions}
          onAskFinding={askFinding}
          questionCost={0.1}
        />,
      );
    });

    const openButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Ask about this · 0.1 credit'),
    );
    expect(openButton).toBeDefined();

    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(loadQuestions).toHaveBeenCalledWith(0);
    expect(container.textContent).toContain('Failed answers are automatically refunded');

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      )?.set;
      setValue?.call(textarea, 'Why is round wrong?');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const submitButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Ask · 0.1 credit'),
    );
    await act(async () => {
      submitButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(askFinding).toHaveBeenCalledWith(0, 'Why is round wrong?');
    expect(container.textContent).toContain('Flat knitting is worked in rows.');
  });
});
