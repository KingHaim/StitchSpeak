// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const analytics = vi.hoisted(() => ({
  getAnalyticsConsent: vi.fn(() => null),
  grantAnalyticsConsent: vi.fn(),
  denyAnalyticsConsent: vi.fn(),
}));

vi.mock('../services/analytics', () => analytics);

import { AnalyticsConsentBanner } from './AnalyticsConsentBanner';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  analytics.getAnalyticsConsent.mockReturnValue(null);
});

afterEach(() => {
  container?.remove();
  container = null;
});

describe('AnalyticsConsentBanner', () => {
  it('does not grant analytics when the visitor rejects', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<AnalyticsConsentBanner />);
    });

    const reject = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Reject'),
    );
    expect(reject).toBeDefined();

    await act(async () => {
      reject?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(analytics.denyAnalyticsConsent).toHaveBeenCalledTimes(1);
    expect(analytics.grantAnalyticsConsent).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('Analytics and session recording');

    await act(async () => root.unmount());
  });
});
