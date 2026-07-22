import React, { useCallback, useEffect, useState } from 'react';
import {
  adjustAdminCredits,
  deleteAdminUpload,
  getAdminMe,
  getAdminMember,
  getAdminMemberActivity,
  getAdminMembers,
  getAdminOverview,
  inviteAdminUser,
  type AdminMember,
  type AdminMemberActivity,
  type AdminMemberDetail,
  type AdminMemberSort,
  type AdminOverview,
} from '../../services/adminService';
import { BetaApplicationsSection } from '../admin/BetaApplicationsSection';
import { SelectDropdown } from '../SelectDropdown';

const money = (n: number) => new Intl.NumberFormat('en', { style: 'currency', currency: 'EUR' }).format(n / 100);
const date = (n: number | null) => (n ? new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(n) : 'No activity');
const bytes = (n: number) => (n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const Icon = ({ name }: { name: string }) => <span className="material-symbols-outlined text-[20px]" aria-hidden>{name}</span>;

export const AdminPage: React.FC = () => {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [detail, setDetail] = useState<AdminMemberDetail | null>(null);
  const [activity, setActivity] = useState<AdminMemberActivity | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [activityDays, setActivityDays] = useState(7);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<AdminMemberSort>('lastActivity');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [betaOnly, setBetaOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getAdminMe()
      .then((r) => {
        if (!cancelled) setAuthorized(r.admin === true);
      })
      .catch(() => {
        if (!cancelled) setAuthorized(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [o, m] = await Promise.all([
        getAdminOverview(),
        getAdminMembers({ q: query, sort, dir, beta: betaOnly }),
      ]);
      setOverview(o);
      setMembers(m.members);
      if (selected) setDetail(await getAdminMember(selected));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load admin data.');
    } finally {
      setLoading(false);
    }
  }, [query, selected, sort, dir, betaOnly]);

  useEffect(() => {
    if (authorized === true) void refresh();
  }, [refresh, authorized]);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    void getAdminMember(selected)
      .then(setDetail)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load member.'));
  }, [selected]);

  useEffect(() => {
    if (!selected) {
      setActivity(null);
      setActivityError(null);
      return;
    }
    let cancelled = false;
    setActivity(null);
    setActivityError(null);
    void getAdminMemberActivity(selected, activityDays)
      .then((a) => {
        if (!cancelled) setActivity(a);
      })
      .catch((e) => {
        if (!cancelled) setActivityError(e instanceof Error ? e.message : 'Could not load activity.');
      });
    return () => {
      cancelled = true;
    };
  }, [selected, activityDays]);

  const toggleSort = (column: AdminMemberSort) => {
    if (sort === column) setDir((current) => (current === 'asc' ? 'desc' : 'asc'));
    else {
      setSort(column);
      setDir(column === 'lastActivity' ? 'desc' : 'asc');
    }
  };

  const adjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    setSaving(true);
    try {
      await adjustAdminCredits(detail.member.sub, Number(delta), reason);
      setDelta('');
      setReason('');
      await refresh();
    } catch (x) {
      setError(x instanceof Error ? x.message : 'Could not adjust credits.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string, name: string) => {
    if (!detail || !window.confirm(`Delete ${name}? This removes its source, translation, thumbnail, and chat history.`)) return;
    try {
      await deleteAdminUpload(detail.member.sub, id);
      await refresh();
    } catch (x) {
      setError(x instanceof Error ? x.message : 'Could not delete upload.');
    }
  };

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    setInviteNotice(null);
    setError(null);
    try {
      const result = await inviteAdminUser(inviteEmail, inviteName || undefined);
      setInviteNotice(
        result.alreadyActive
          ? `Account already active for ${result.email}. Balance: ${result.balance.toFixed(1)}.`
          : `Invited ${result.email} with ${result.creditsGranted ? '50 starter credits' : 'existing starter credits'}. ${result.emailSent ? 'Invite email sent.' : 'Invite email could not be sent.'}`,
      );
      setInviteEmail('');
      setInviteName('');
      setSelected(result.sub);
      await refresh();
    } catch (x) {
      setError(x instanceof Error ? x.message : 'Could not send invite.');
    } finally {
      setInviting(false);
    }
  };

  const metrics: [string, string | number, string][] = [
    ['Members', overview?.members ?? 0, 'group'],
    ['Uploads', overview?.uploads ?? 0, 'upload_file'],
    ['Credits used', (overview?.credits ?? 0).toFixed(1), 'toll'],
    ['Net revenue', money(overview?.revenueCents ?? 0), 'payments'],
    ['Stored files', bytes(overview?.storageBytes ?? 0), 'database'],
  ];

  const sortLabel = (column: AdminMemberSort, label: string) =>
    `${label}${sort === column ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}`;

  if (authorized === null) {
    return <div className="flex min-h-[100dvh] items-center justify-center bg-[#f3f5f4] text-sm text-[#617067]">Checking access…</div>;
  }
  if (!authorized) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-[#f3f5f4] px-6 text-center text-[#17231d]">
        <Icon name="lock" />
        <h1 className="font-headline text-3xl font-semibold">Administrator access required</h1>
        <p className="max-w-md text-sm text-[#617067]">This account is not authorized to view the StitchSpeak admin console.</p>
        <a href="/" className="rounded-lg bg-[#314d3a] px-5 py-2.5 text-sm font-bold text-white">Back to app</a>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#f3f5f4] font-body text-[#17231d]">
      <header className="sticky top-0 z-30 border-b border-[#1d2b23]/10 bg-[#f3f5f4]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="" className="h-9 w-9" />
            <div>
              <p className="font-headline text-lg font-bold">StitchSpeak Control</p>
              <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#617067]">Operations ledger</p>
            </div>
          </div>
          <a href="/" className="rounded-lg border border-[#314d3a]/20 bg-white px-4 py-2 text-sm font-bold">Back to app</a>
        </div>
      </header>
      <main className="mx-auto max-w-[1500px] px-5 py-8 sm:px-8">
        <h1 className="font-headline text-4xl font-semibold">Member operations</h1>
        <p className="mt-2 text-[#617067]">Accounts, credits, uploads, conversations, and payment movement.</p>
        {error && <div role="alert" className="my-6 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-800">{error}</div>}

        <section className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-[#1d2b23]/10 lg:grid-cols-5">
          {metrics.map(([l, v, i]) => (
            <div key={l} className="bg-white p-5">
              <div className="flex gap-2 text-[#617067]">
                <Icon name={i} />
                <span className="text-xs font-bold uppercase tracking-wider">{l}</span>
              </div>
              <p className="mt-5 font-mono text-2xl font-bold">{v}</p>
            </div>
          ))}
        </section>

        <section className="mt-8 overflow-hidden rounded-2xl border border-[#1d2b23]/10 bg-white p-5">
          <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#617067]">Beta invite</p>
          <h2 className="mt-1 font-headline text-2xl font-semibold">Invite user by email</h2>
          <p className="mt-1 text-sm text-[#617067]">Creates an account without a password, grants 50 starter credits once, and emails a set-password link.</p>
          <form onSubmit={invite} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <input
              required
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="designer@example.com"
              className="rounded-lg border border-[#7b887f] px-4 py-2.5 text-sm"
            />
            <input
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              placeholder="Name (optional)"
              className="rounded-lg border border-[#7b887f] px-4 py-2.5 text-sm"
            />
            <button disabled={inviting} className="rounded-lg bg-[#315e40] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">
              {inviting ? 'Inviting…' : 'Send invite'}
            </button>
          </form>
          {inviteNotice && <p role="status" className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">{inviteNotice}</p>}
        </section>

        <BetaApplicationsSection onManageMember={setSelected} />

        <div className="mt-8 grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
          <section className="overflow-hidden rounded-2xl border border-[#1d2b23]/10 bg-white">
            <div className="flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-headline text-2xl font-semibold">Members</h2>
                <p className="text-sm text-[#617067]">Select a row to inspect activity. Sort by balance or credits used.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-[#425047]">
                  <input type="checkbox" checked={betaOnly} onChange={(e) => setBetaOnly(e.target.checked)} className="accent-[#315e40]" />
                  Beta only
                </label>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search email or member ID"
                  className="rounded-lg border border-[#7b887f] px-4 py-2.5 text-sm sm:w-72"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-[#eef1ef] text-[11px] uppercase tracking-wider text-[#617067]">
                  <tr>
                    <th className="px-5 py-3">Member</th>
                    <th>
                      <button type="button" onClick={() => toggleSort('balance')} className="font-bold uppercase tracking-wider">
                        {sortLabel('balance', 'Balance')}
                      </button>
                    </th>
                    <th>Uploads</th>
                    <th>
                      <button type="button" onClick={() => toggleSort('creditsSpent')} className="font-bold uppercase tracking-wider">
                        {sortLabel('creditsSpent', 'Used')}
                      </button>
                    </th>
                    <th>Revenue</th>
                    <th>
                      <button type="button" onClick={() => toggleSort('lastActivity')} className="font-bold uppercase tracking-wider">
                        {sortLabel('lastActivity', 'Last activity')}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {members.map((m) => (
                    <tr
                      key={m.sub}
                      onClick={() => setSelected(m.sub)}
                      className={`cursor-pointer hover:bg-[#f2f6f2] ${selected === m.sub ? 'bg-[#e8f0e8]' : ''}`}
                    >
                      <td className="px-5 py-4">
                        <p className="font-semibold">{m.email || 'Email unavailable'}</p>
                        <p className="max-w-52 truncate font-mono text-[10px] text-[#78847c]">{m.sub}</p>
                      </td>
                      <td className="font-mono font-bold">{m.balance.toFixed(2)}</td>
                      <td>{m.uploads}</td>
                      <td>{m.creditsSpent.toFixed(1)}</td>
                      <td>{money(m.revenueCents)}</td>
                      <td className="pr-5 text-xs text-[#617067]">{date(m.lastActivity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && members.length === 0 && <p className="p-10 text-center text-[#617067]">No matching members.</p>}
            </div>
          </section>
          <aside className="rounded-2xl bg-[#17231d] p-6 text-white xl:sticky xl:top-24 xl:max-h-[calc(100dvh-7rem)] xl:overflow-y-auto">
            {!detail ? (
              <div className="flex min-h-72 flex-col items-center justify-center text-white/60">
                <Icon name="person_search" />
                <p className="mt-3">Select a member.</p>
              </div>
            ) : (
              <>
                <p className="text-xs font-bold uppercase tracking-[.18em] text-[#aebdb3]">Member ledger</p>
                <h2 className="mt-3 break-all font-headline text-2xl">{detail.member.email || detail.member.sub}</h2>
                <div className="mt-5 grid grid-cols-3 gap-2">
                  {(
                    [
                      ['Credits', detail.member.balance],
                      ['Uploads', detail.member.uploads],
                      ['Chats', detail.member.chatMessages],
                    ] as const
                  ).map(([l, v]) => (
                    <div key={String(l)} className="rounded-xl bg-white/8 p-3">
                      <p className="text-[10px] uppercase text-white/55">{l}</p>
                      <p className="mt-2 font-mono text-lg font-bold">{v}</p>
                    </div>
                  ))}
                </div>
                <form onSubmit={adjust} className="mt-7 border-t border-white/12 pt-5">
                  <h3 className="font-semibold">Adjust credits</h3>
                  <div className="mt-3 grid grid-cols-[105px_1fr] gap-2">
                    <input required type="number" step=".01" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="+5 / -2" className="min-w-0 rounded-lg bg-white/10 px-3 py-2.5" />
                    <input required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Audit reason" className="min-w-0 rounded-lg bg-white/10 px-3 py-2.5" />
                  </div>
                  <button disabled={saving} className="mt-3 w-full rounded-lg bg-[#cfe1d2] py-2.5 font-bold text-[#17231d]">
                    {saving ? 'Saving…' : 'Apply adjustment'}
                  </button>
                </form>
                <div className="mt-7 border-t border-white/12 pt-5">
                  <h3 className="font-semibold">Uploads</h3>
                  <div className="mt-3 space-y-2">
                    {detail.uploads.map((u) => (
                      <div key={u.id} className="rounded-xl bg-white/8 p-3">
                        <div className="flex justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{u.fileName}</p>
                            <p className="text-xs text-white/55">
                              {u.sourceLanguage || 'Auto'} → {u.targetLanguage} · {u.cost} credits
                            </p>
                          </div>
                          <button onClick={() => void remove(u.id, u.fileName)} className="text-red-300" aria-label={`Delete ${u.fileName}`}>
                            <Icon name="delete" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-7 border-t border-white/12 pt-5">
                  <h3 className="font-semibold">Credit movements</h3>
                  <p className="mt-1 text-xs text-white/45">Every charge, refund, purchase, and adjustment.</p>
                  {(detail.ledger ?? []).length === 0 && <p className="mt-3 text-xs text-white/55">No movements recorded yet.</p>}
                  <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                    {(detail.ledger ?? []).map((entry) => (
                      <div key={entry.id} className="rounded-xl bg-white/8 p-3 text-xs">
                        <div className="flex justify-between gap-2">
                          <span className="font-semibold">{entry.label ?? entry.kind}</span>
                          <span className={entry.delta >= 0 ? 'font-mono text-emerald-300' : 'font-mono text-red-300'}>
                            {entry.delta > 0 ? '+' : ''}
                            {entry.delta.toFixed(2)}
                          </span>
                        </div>
                        <div className="mt-1 flex justify-between gap-2 text-white/45">
                          <span>{date(entry.createdAt)}</span>
                          <span>balance {entry.balanceAfter.toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-7 border-t border-white/12 pt-5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold">Activity (PostHog)</h3>
                    <SelectDropdown
                      variant="inverse"
                      className="w-auto"
                      buttonClassName="rounded-lg border-0 bg-white/10 px-2 py-1 text-xs"
                      value={String(activityDays)}
                      onChange={(v) => setActivityDays(Number(v))}
                      aria-label="Activity window"
                      options={[
                        { id: '1', label: '24h' },
                        { id: '7', label: '7 days' },
                        { id: '30', label: '30 days' },
                      ]}
                    />
                  </div>
                  {activityError && <p className="mt-3 text-xs text-red-300">{activityError}</p>}
                  {!activityError && !activity && <p className="mt-3 text-xs text-white/55">Loading activity…</p>}
                  {activity && !activity.configured && (
                    <p className="mt-3 text-xs text-white/55">
                      Not configured. Set POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID on the server.
                    </p>
                  )}
                  {activity?.configured && (
                    <>
                      <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-white/45">Pages visited</p>
                      {(activity.pages ?? []).length === 0 && <p className="mt-2 text-xs text-white/55">No pageviews in this window.</p>}
                      <div className="mt-2 space-y-1">
                        {(activity.pages ?? []).map((p) => (
                          <div key={p.path} className="flex justify-between gap-2 text-xs">
                            <span className="truncate">{p.name ?? p.path}</span>
                            <span className="shrink-0 text-white/45">×{p.count}</span>
                          </div>
                        ))}
                      </div>
                      <p className="mt-4 text-[10px] font-bold uppercase tracking-wider text-white/45">Actions</p>
                      {(activity.actions ?? []).length === 0 && <p className="mt-2 text-xs text-white/55">No actions in this window.</p>}
                      <div className="mt-2 space-y-1">
                        {(activity.actions ?? []).map((a) => (
                          <div key={a.event} className="flex justify-between gap-2 text-xs">
                            <span className="truncate">{a.label ?? a.event}</span>
                            <span className="shrink-0 text-white/45">×{a.count}</span>
                          </div>
                        ))}
                      </div>
                      <p className="mt-4 text-[10px] font-bold uppercase tracking-wider text-white/45">Screen recordings</p>
                      {(activity.recordings ?? []).length === 0 && (
                        <p className="mt-2 text-xs text-white/55">No recordings in this window.</p>
                      )}
                      <div className="mt-2 space-y-1">
                        {(activity.recordings ?? []).map((r) => (
                          <a
                            key={r.id}
                            href={r.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex justify-between gap-2 text-xs text-emerald-200 underline decoration-emerald-200/40 hover:decoration-emerald-200"
                          >
                            <span className="truncate">{date(Date.parse(r.startTime))}</span>
                            <span className="shrink-0 text-white/45">{Math.max(1, Math.round(r.durationSeconds / 60))} min</span>
                          </a>
                        ))}
                      </div>
                      <p className="mt-4 text-[10px] font-bold uppercase tracking-wider text-white/45">Timeline</p>
                      <div className="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1">
                        {(activity.events ?? []).slice(0, 60).map((ev, i) => (
                          <div key={`${ev.timestamp}-${i}`} className="rounded-xl bg-white/8 p-2.5 text-xs">
                            <div className="flex justify-between gap-2">
                              <span className="truncate font-semibold">{ev.description ?? ev.event}</span>
                              <span className="shrink-0 text-white/45">{date(Date.parse(ev.timestamp))}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <div className="mt-7 border-t border-white/12 pt-5">
                  <h3 className="font-semibold">Credit audit</h3>
                  {detail.adjustments.slice(0, 8).map((a) => (
                    <div key={a.id} className="mt-3 text-xs">
                      <div className="flex justify-between">
                        <span className={a.delta >= 0 ? 'text-emerald-300' : 'text-red-300'}>
                          {a.delta > 0 ? '+' : ''}
                          {a.delta}
                        </span>
                        <span className="text-white/45">{date(a.createdAt)}</span>
                      </div>
                      <p className="text-white/65">{a.reason}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
};
