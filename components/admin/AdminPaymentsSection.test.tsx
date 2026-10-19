// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const getAdminPaymentReconcile = vi.fn();
const applyAdminUnappliedOrder = vi.fn();
const dismissAdminUnappliedOrder = vi.fn();

vi.mock('../../services/adminService', () => ({
  getAdminPaymentReconcile: (...args: unknown[]) => getAdminPaymentReconcile(...args),
  applyAdminUnappliedOrder: (...args: unknown[]) => applyAdminUnappliedOrder(...args),
  dismissAdminUnappliedOrder: (...args: unknown[]) => dismissAdminUnappliedOrder(...args),
}));

import { AdminPaymentsSection } from './AdminPaymentsSection';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  getAdminPaymentReconcile.mockReset();
  applyAdminUnappliedOrder.mockReset();
  dismissAdminUnappliedOrder.mockReset();
});

describe('AdminPaymentsSection', () => {
  it('lists paid orders that were not credited and can apply or dismiss them', async () => {
    getAdminPaymentReconcile.mockResolvedValue({
      configured: true,
      since: new Date().toISOString(),
      missingCredits: [{
        orderId: 'order-1',
        status: 'paid',
        userEmail: 'buyer@example.com',
        total: 700,
        createdAt: new Date().toISOString(),
        credited: false,
        unapplied: {
          orderId: 'order-1',
          reason: 'missing_sub',
          status: 'paid',
          sub: 'buyer-1',
          packId: 'credits_7',
          credits: 7,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        source: 'lemon_squeezy',
      }],
      unapplied: [],
    });
    applyAdminUnappliedOrder.mockResolvedValue({ applied: true });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<AdminPaymentsSection />);
    });

    expect(container.textContent).toContain('order-1');
    expect(container.textContent).toContain('missing_sub');
    const apply = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Apply');
    expect(apply).toBeDefined();
    await act(async () => {
      apply?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(applyAdminUnappliedOrder).toHaveBeenCalledWith('order-1');
  });
});
