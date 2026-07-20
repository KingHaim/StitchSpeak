import React, { useCallback, useEffect, useState } from 'react';
import {
  getAdminBetaApplications,
  reviewAdminBetaApplication,
  type AdminBetaApplication,
  type BetaApplicationStatus,
} from '../../services/adminService';

const filters: Array<{ value: '' | BetaApplicationStatus; label: string }> = [
  { value: '', label: 'All' },
  { value: 'new', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];
const date = (value: string) => new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
const attributionLabel = (item: AdminBetaApplication) =>
  [item.utmSource, item.utmMedium, item.utmCampaign].filter(Boolean).join(' / ') || 'Direct / unknown';

interface BetaApplicationsSectionProps {
  onManageMember?: (sub: string) => void;
}

export const BetaApplicationsSection: React.FC<BetaApplicationsSectionProps> = ({ onManageMember }) => {
  const [items, setItems] = useState<AdminBetaApplication[]>([]);
  const [filter, setFilter] = useState<'' | BetaApplicationStatus>('new');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ message: string; tone: 'success' | 'warning' } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems((await getAdminBetaApplications(filter || undefined)).applications);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load beta applications.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const review = async (item: AdminBetaApplication, status: 'approved' | 'rejected') => {
    const confirmMsg =
      status === 'approved'
        ? `Approve ${item.name}? This creates their account, grants 50 starter credits, and sends a set-password invite email.`
        : `Reject ${item.name}'s beta application?`;
    if (!window.confirm(confirmMsg)) return;
    setWorking(item.id);
    setError(null);
    setNotice(null);
    try {
      const response = await reviewAdminBetaApplication(item.id, status);
      await load();
      if (status === 'approved') {
        const invite = response.invite;
        setNotice({
          tone: response.emailSent || invite?.alreadyActive ? 'success' : 'warning',
          message: invite?.alreadyActive
            ? `Approved ${item.name}. Account already active — starter credits ${invite.creditsGranted ? 'granted' : 'already on file'} (${invite.balance.toFixed(0)} balance).`
            : response.emailSent
              ? `Approved ${item.name}, granted ${invite?.creditsGranted ? '50 starter credits' : 'credits (already granted)'}, and sent the invite to ${item.email}.`
              : `Approved ${item.name}, but the invite email could not be sent. Email them manually at ${item.email}.`,
        });
      } else {
        setNotice({
          tone: response.emailSent ? 'success' : 'warning',
          message: response.emailSent
            ? `Rejected ${item.name} and sent a confirmation email to ${item.email}.`
            : `Rejected ${item.name}, but the notification email could not be sent. Email them manually at ${item.email}.`,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the application.');
    } finally {
      setWorking(null);
    }
  };

  return (
    <section className="mt-8 overflow-hidden rounded-2xl border border-[#1d2b23]/10 bg-white">
      <div className="flex flex-col gap-5 border-b p-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#617067]">Designer beta</p>
          <h2 className="mt-1 font-headline text-2xl font-semibold">Beta applications</h2>
          <p className="mt-1 text-sm text-[#617067]">Review applicants. Approve sends an invite email and grants 50 starter credits.</p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter beta applications">
          {filters.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => setFilter(item.value)}
              className={`rounded-lg px-3.5 py-2 text-sm font-bold ${filter === item.value ? 'bg-[#17231d] text-white' : 'bg-[#eef1ef] text-[#425047]'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {notice && (
        <p
          role="status"
          className={`m-5 rounded-xl p-4 text-sm font-semibold ${notice.tone === 'success' ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}
        >
          {notice.message}
        </p>
      )}
      {error && <p role="alert" className="m-5 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-800">{error}</p>}
      {loading ? (
        <p className="p-10 text-center text-[#617067]">Loading applications…</p>
      ) : items.length === 0 ? (
        <p className="p-12 text-center text-[#617067]">No {filter === 'new' ? 'pending ' : ''}applications.</p>
      ) : (
        <div className="divide-y divide-[#1d2b23]/10">
          {items.map((item) => (
            <article key={item.id} className="grid gap-5 p-5 lg:grid-cols-[1fr_auto]">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-headline text-xl font-semibold">{item.name}</h3>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${
                      item.status === 'new'
                        ? 'bg-amber-100 text-amber-800'
                        : item.status === 'approved'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {item.status === 'new' ? 'Pending' : item.status}
                  </span>
                </div>
                <a href={`mailto:${item.email}`} className="mt-1 block break-all text-sm font-semibold text-[#315e40] hover:underline">
                  {item.email}
                </a>
                {item.instagramHandle ? (
                  <a
                    href={`https://www.instagram.com/${item.instagramHandle.replace(/^@/, '')}/`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block text-sm font-semibold text-[#315e40] hover:underline"
                  >
                    {item.instagramHandle}
                  </a>
                ) : (
                  <p className="mt-1 text-sm text-[#78847c]">Instagram not collected</p>
                )}
                {(item.balance != null || item.creditsSpent != null) && (
                  <p className="mt-3 font-mono text-sm text-[#425047]">
                    Credits: {item.balance != null ? item.balance.toFixed(1) : '—'} available
                    {item.creditsSpent != null ? ` · ${item.creditsSpent.toFixed(1)} used` : ''}
                  </p>
                )}
                <div className="mt-3 rounded-xl bg-[#eef1ef] p-3 text-xs text-[#425047]">
                  <p>
                    <span className="font-bold text-[#617067]">Source:</span> {attributionLabel(item)}
                  </p>
                </div>
                <p className={`mt-2 text-xs font-bold ${item.promotionConfirmed ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {item.promotionConfirmed ? 'Participation agreement accepted' : 'Legacy application — no agreement recorded'}
                </p>
                <p className="mt-4 text-xs text-[#78847c]">Applied {date(item.createdAt)}</p>
                {item.reviewedAt && (
                  <p className="mt-1 text-xs text-[#78847c]">
                    Reviewed {date(item.reviewedAt)} by {item.reviewedBy}
                  </p>
                )}
              </div>
              <div className="flex gap-2 lg:w-36 lg:flex-col">
                <button
                  type="button"
                  disabled={working === item.id || item.status === 'approved'}
                  onClick={() => void review(item, 'approved')}
                  className="flex-1 rounded-lg bg-[#315e40] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={working === item.id || item.status === 'rejected'}
                  onClick={() => void review(item, 'rejected')}
                  className="flex-1 rounded-lg border border-red-200 px-4 py-2.5 text-sm font-bold text-red-700 disabled:opacity-40"
                >
                  Reject
                </button>
                {item.memberSub && onManageMember && (
                  <button
                    type="button"
                    onClick={() => onManageMember(item.memberSub!)}
                    className="flex-1 rounded-lg border border-[#314d3a]/25 px-4 py-2.5 text-sm font-bold text-[#17231d]"
                  >
                    Manage
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};
