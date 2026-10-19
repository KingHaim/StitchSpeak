import React, { useCallback, useEffect, useState } from 'react';
import {
  applyAdminUnappliedOrder,
  dismissAdminUnappliedOrder,
  getAdminPaymentReconcile,
  type AdminPaymentReconcile,
} from '../../services/adminService';

const money = (n: number | null) =>
  n == null ? '—' : new Intl.NumberFormat('en', { style: 'currency', currency: 'EUR' }).format(n / 100);

export const AdminPaymentsSection: React.FC = () => {
  const [report, setReport] = useState<AdminPaymentReconcile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await getAdminPaymentReconcile());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load payment reconciliation.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const apply = async (orderId: string) => {
    setWorking(orderId);
    setError(null);
    try {
      await applyAdminUnappliedOrder(orderId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not apply this order.');
    } finally {
      setWorking(null);
    }
  };

  const dismiss = async (orderId: string) => {
    setWorking(orderId);
    setError(null);
    try {
      await dismissAdminUnappliedOrder(orderId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not dismiss this order.');
    } finally {
      setWorking(null);
    }
  };

  const gaps = report?.missingCredits ?? [];

  return (
    <section className="mt-8 overflow-hidden rounded-2xl border border-[#1d2b23]/10 bg-white p-5" data-testid="admin-payments">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#617067]">Payments</p>
          <h2 className="mt-1 font-headline text-2xl font-semibold">Uncredited orders</h2>
          <p className="mt-1 text-sm text-[#617067]">
            Last 7 days from Lemon Squeezy, compared with credited and unapplied orders.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-[#7b887f] bg-white px-4 py-2.5 text-sm font-semibold text-[#314d3a]"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">{error}</p>}
      {report?.lemonSqueezyError && (
        <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Lemon Squeezy list failed: {report.lemonSqueezyError}. Showing local unapplied orders only.
        </p>
      )}
      {gaps.length === 0 && !loading && (
        <p className="mt-5 text-sm text-[#617067]">No paid orders are waiting for credits.</p>
      )}
      {gaps.length > 0 && (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-[#eef1ef] text-[11px] uppercase tracking-wider text-[#617067]">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th>Status</th>
                <th>Total</th>
                <th>Reason</th>
                <th>Account</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y">
              {gaps.map((gap) => (
                <tr key={gap.orderId}>
                  <td className="px-4 py-3 font-mono text-xs">{gap.orderId}</td>
                  <td>{gap.status}</td>
                  <td>{money(gap.total)}</td>
                  <td>{gap.unapplied?.reason ?? 'missing_locally'}</td>
                  <td className="max-w-40 truncate font-mono text-xs">{gap.unapplied?.sub || gap.userEmail || '—'}</td>
                  <td className="pr-4 text-right">
                    <div className="flex justify-end gap-2">
                      {gap.unapplied && (
                        <button
                          type="button"
                          disabled={working === gap.orderId}
                          onClick={() => void apply(gap.orderId)}
                          className="rounded-lg bg-[#315e40] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                        >
                          Apply
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={working === gap.orderId}
                        onClick={() => void dismiss(gap.orderId)}
                        className="rounded-lg border border-[#7b887f] px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                      >
                        Dismiss
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
