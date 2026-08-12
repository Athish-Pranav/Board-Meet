import Link from "next/link";
import { requireUser } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { getWhatsNew } from "@/lib/whatsnew";
import { fmtRelative } from "@/lib/format";
import { gapDays, minutesOverdue, noticeSeverity, RULES } from "@/lib/compliance";
import { MEETING_TYPE_LABELS, type MeetingType } from "@/lib/enums";
import { Card, StatusBadge, Badge } from "@/components/ui";
import { Icon } from "@/components/icons";
import { KpiCard } from "@/components/Kpi";
import { ProgressRing, Donut, Bars } from "@/components/charts";
import { WhatsNewFeed } from "@/components/WhatsNewFeed";
import { format, startOfMonth, subMonths, isSameMonth } from "date-fns";

export const dynamic = "force-dynamic";

const ACTION_ICONS: Record<string, string> = {
  create: "document", update: "minutes", publish: "document", approve: "check", vote: "vote",
  login: "users", logout: "users", circulate: "chat", conclude: "calendar", start: "calendar",
  download: "document", annotate: "chat", notice: "bell", "paper-alert": "bell", reschedule: "calendar",
};

export default async function DashboardPage() {
  const user = await requireUser();
  const now = new Date();
  const sixMonthsAgo = startOfMonth(subMonths(now, 5));

  const isSuper = ["CompanySecretary", "CFO"].includes(user.role);
  const restrictionFilter = !isSuper ? {
    OR: [
      { type: { not: "Committee" } },
      {
        committee: {
          members: {
            some: {
              userId: user.id
            }
          }
        }
      }
    ]
  } : {};

  const [whatsNew, announcements, upcoming, recentMeetings, lastBoard, concluded, myActions, openActions, resCounts, circulated, myVotes, activity] = await Promise.all([
    getWhatsNew(user.id),
    prisma.announcement.findMany({ where: { deletedAt: null }, include: { createdBy: { select: { name: true } } }, orderBy: [{ pinned: "desc" }, { createdAt: "desc" }], take: 3 }),
    prisma.meeting.findMany({
      where: {
        deletedAt: null,
        scheduledAt: { gte: now },
        status: { in: ["Scheduled", "InSession", "Draft"] },
        ...restrictionFilter,
      },
      orderBy: { scheduledAt: "asc" },
      take: 5,
      include: { committee: { select: { name: true } } }
    }),
    prisma.meeting.findMany({
      where: {
        deletedAt: null,
        scheduledAt: { gte: sixMonthsAgo },
        ...restrictionFilter,
      },
      select: { scheduledAt: true, noticeSentAt: true, shortNoticeConsent: true }
    }),
    prisma.meeting.findFirst({
      where: {
        deletedAt: null,
        type: "Board",
        scheduledAt: { lte: now },
        ...restrictionFilter,
      },
      orderBy: { scheduledAt: "desc" }
    }),
    prisma.meeting.findMany({
      where: {
        deletedAt: null,
        status: "Concluded",
        ...restrictionFilter,
      },
      select: { scheduledAt: true, minutes: { select: { finalizedAt: true } } }
    }),
    prisma.actionItem.findMany({ where: { deletedAt: null, assigneeId: user.id, status: { not: "Done" } }, orderBy: { dueDate: "asc" }, take: 5 }),
    prisma.actionItem.findMany({ where: { deletedAt: null, status: { not: "Done" } }, select: { dueDate: true, createdAt: true } }),
    prisma.agendaItem.groupBy({ by: ["votingStatus"], where: { deletedAt: null, classification: "ForApproval" }, _count: true }),
    prisma.agendaItem.findMany({ where: { deletedAt: null, classification: "ForApproval", votingStatus: "Circulated" }, select: { id: true, title: true } }),
    prisma.vote.findMany({ where: { userId: user.id }, select: { agendaItemId: true } }),
    prisma.auditLog.findMany({ orderBy: { at: "desc" }, take: 7, include: { actor: { select: { name: true } } } }),
  ]);

  // Meetings per month (last 6)
  const months = Array.from({ length: 6 }, (_, i) => startOfMonth(subMonths(now, 5 - i)));
  const meetingsByMonth = months.map((m) => ({ label: format(m, "MMM"), value: recentMeetings.filter((x) => isSameMonth(x.scheduledAt, m)).length }));
  const actionsByMonth = months.map((m) => openActions.filter((a) => isSameMonth(a.createdAt, m)).length);
  const meetSeries = meetingsByMonth.map((m) => m.value);

  // Pipeline
  const overdueMinutes = concluded.filter((m) => minutesOverdue(m.scheduledAt, m.minutes?.finalizedAt ?? null, now)).length;
  const gapToToday = lastBoard ? gapDays(lastBoard.scheduledAt, now) : null;
  const gapWarning = gapToToday !== null && gapToToday > RULES.MAX_GAP_DAYS;
  const votedIds = new Set(myVotes.map((v) => v.agendaItemId));
  const pendingVotes = circulated.filter((r) => !votedIds.has(r.id));
  const overdueActions = openActions.filter((a) => a.dueDate < now).length;

  // Resolution donut (resolutions = "For Approval" agenda items)
  const get = (s: string) => resCounts.find((r) => r.votingStatus === s)?._count ?? 0;
  const passed = get("Passed"), failed = get("Failed"), pending = get("Circulated") + get("None");
  const resTotal = passed + failed + pending + get("Withdrawn");
  const donut = [
    { value: passed, color: "#0f9d6e", label: "Passed" },
    { value: pending, color: "#bf9a4c", label: "Open" },
    { value: failed, color: "#e11d48", label: "Failed" },
  ];

  // Compliance score (composite)
  const upcomingNoticeOk = recentMeetings.filter((m) => m.scheduledAt >= now);
  const noticeScore = upcomingNoticeOk.length ? (upcomingNoticeOk.filter((m) => noticeSeverity(m.noticeSentAt, m.scheduledAt, m.shortNoticeConsent) !== "breach").length / upcomingNoticeOk.length) * 100 : 100;
  const minutesScore = concluded.length ? ((concluded.length - overdueMinutes) / concluded.length) * 100 : 100;
  const gapScore = gapWarning ? 55 : 100;
  const complianceScore = Math.round(noticeScore * 0.35 + minutesScore * 0.4 + gapScore * 0.25);
  const compTone = complianceScore >= 85 ? "emerald" : complianceScore >= 65 ? "amber" : "rose";

  const trend = (s: number[]) => (s.length < 2 ? "flat" : s[s.length - 1] > s[s.length - 2] ? "up" : s[s.length - 1] < s[s.length - 2] ? "down" : "flat") as "up" | "down" | "flat";

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="panel-navy relative overflow-hidden p-7 sm:p-9">
        <div aria-hidden className="absolute -right-10 -top-16 h-64 w-64 animate-float rounded-full bg-gold-500/20 blur-3xl" />
        <div aria-hidden className="absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-brand-400/25 blur-3xl" />
        <div aria-hidden className="absolute inset-x-7 bottom-0 h-px bg-gradient-to-r from-transparent via-gold-500/40 to-transparent" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-300">{format(now, "EEEE, d MMMM yyyy")}</p>
            <h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight text-cream-50">Good day, {user.name.split(" ")[0]}.</h1>
            <p className="mt-2 max-w-lg text-sm text-slate-300">Here&rsquo;s the state of the boardroom — meetings, approvals and compliance at a glance.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/meetings/new" className="btn-gold">+ New meeting</Link>
            <Link href="/calendar" className="rounded-xl border border-gold-400/30 bg-white/5 px-4 py-2 text-sm font-semibold text-cream-50 backdrop-blur transition hover:border-gold-400/60 hover:bg-white/10">Calendar</Link>
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 stagger sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Upcoming meetings" value={upcoming.length} icon="calendar" tone="brand" spark={meetSeries} trend={{ dir: trend(meetSeries), text: "6-mo" }} href="/meetings" />
        <KpiCard label="Open action items" value={openActions.length} icon="clipboard" tone={overdueActions ? "rose" : "amber"} spark={actionsByMonth} hint={overdueActions ? `${overdueActions} overdue` : "On track"} href="/action-items" />
        <KpiCard label="Awaiting your vote" value={pendingVotes.length} icon="vote" tone="gold" hint={pendingVotes.length ? "Action needed" : "Nothing pending"} href="/resolutions" />
        <KpiCard label="Compliance score" value={`${complianceScore}%`} icon="shield" tone={compTone} trend={{ dir: complianceScore >= 85 ? "up" : "down", text: compTone === "emerald" ? "Healthy" : "Review" }} href="/compliance" />
      </div>

      {/* Alerts */}
      {(gapWarning || overdueMinutes > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {gapWarning && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <Icon name="warning" className="mt-0.5 h-5 w-5" />
              <span><strong>{gapToToday} days</strong> since the last board meeting (max {RULES.MAX_GAP_DAYS}, s.173(1)). <Link href="/meetings/new" className="font-semibold underline">Schedule →</Link></span>
            </div>
          )}
          {overdueMinutes > 0 && (
            <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              <Icon name="warning" className="mt-0.5 h-5 w-5" />
              <span><strong>{overdueMinutes}</strong> meeting(s) with minutes overdue (s.118). <Link href="/minutes" className="font-semibold underline">Review →</Link></span>
            </div>
          )}
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="section-title">Meeting activity</h2>
              <p className="text-xs text-slate-400">Meetings scheduled per month</p>
            </div>
            <Badge tone="blue">Last 6 months</Badge>
          </div>
          <Bars data={meetingsByMonth} height={160} />
        </Card>

        <Card className="flex flex-col items-center justify-center">
          <h2 className="section-title mb-2 self-start">Compliance health</h2>
          <ProgressRing value={complianceScore} sublabel="composite" color={compTone === "rose" ? "#f43f5e" : compTone === "amber" ? "#f59e0b" : "#10b981"} />
          <div className="mt-3 grid w-full grid-cols-3 gap-2 text-center text-xs">
            <div><p className="font-bold text-slate-800">{Math.round(noticeScore)}%</p><p className="text-slate-400">Notice</p></div>
            <div><p className="font-bold text-slate-800">{Math.round(minutesScore)}%</p><p className="text-slate-400">Minutes</p></div>
            <div><p className="font-bold text-slate-800">{gapScore}%</p><p className="text-slate-400">Cadence</p></div>
          </div>
        </Card>
      </div>

      {/* Middle row: What's New + Upcoming + Resolutions donut */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="section-title">What's New</h2>
            {whatsNew.total > 0 ? <Badge tone="red">{whatsNew.total}</Badge> : null}
          </div>
          <WhatsNewFeed data={whatsNew} limit={5} />
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-title">Upcoming meetings</h2>
            <Link href="/meetings" className="text-sm font-medium text-brand-600 hover:underline">All</Link>
          </div>
          {upcoming.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No meetings scheduled.</p>
          ) : (
            <ul className="space-y-2">
              {upcoming.map((m) => (
                <li key={m.id}>
                  <Link href={`/meetings/${m.id}`} className="flex items-center gap-3 rounded-xl border border-slate-100 p-2.5 hover-lift">
                    <span className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                      <span className="text-[10px] font-semibold uppercase leading-none">{format(m.scheduledAt, "MMM")}</span>
                      <span className="text-base font-bold leading-none">{format(m.scheduledAt, "d")}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800">{m.title}</span>
                      <span className="block text-xs text-slate-400">{MEETING_TYPE_LABELS[m.type as MeetingType] ?? m.type} · {format(m.scheduledAt, "h:mm a")}</span>
                    </span>
                    <StatusBadge status={m.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="flex flex-col">
          <h2 className="section-title mb-3">Resolutions</h2>
          {resTotal === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No resolutions yet.</p>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center">
              <Donut segments={donut} centerLabel={String(resTotal)} centerSub="total" />
              <div className="mt-3 flex flex-wrap justify-center gap-3 text-xs">
                <Legend color="#0f9d6e" label={`Passed ${passed}`} />
                <Legend color="#bf9a4c" label={`Open ${pending}`} />
                <Legend color="#e11d48" label={`Failed ${failed}`} />
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Bottom row: Activity timeline + News + My actions */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <h2 className="section-title mb-3">Recent activity</h2>
          {activity.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">No activity yet.</p>
          ) : (
            <ol className="relative space-y-4 before:absolute before:left-[15px] before:top-1 before:h-[calc(100%-1rem)] before:w-px before:bg-slate-200">
              {activity.map((a) => (
                <li key={a.id} className="relative flex gap-3">
                  <span className="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-slate-500 ring-1 ring-slate-200">
                    <Icon name={ACTION_ICONS[a.action] ?? "document"} className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-sm text-slate-700">{a.summary ?? `${a.action} ${a.entityType}`}</p>
                    <p className="text-xs text-slate-400">{a.actor?.name ?? "System"} · {fmtRelative(a.at)}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-title">News & shared docs</h2>
            <Link href="/news" className="text-sm font-medium text-brand-600 hover:underline">All</Link>
          </div>
          {announcements.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No news posted.</p>
          ) : (
            <ul className="space-y-3">
              {announcements.map((a) => (
                <li key={a.id}>
                  <Link href="/news" className="block rounded-xl border border-slate-100 p-3 hover-lift">
                    <div className="flex items-center gap-2">
                      {a.pinned ? <Icon name="flag" className="h-3.5 w-3.5 text-brand-600" /> : null}
                      <span className="truncate text-sm font-semibold text-slate-800">{a.title}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{a.body}</p>
                    <p className="mt-1 text-xs text-slate-400">{a.createdBy.name} · {fmtRelative(a.createdAt)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-title">My action items</h2>
            <Link href="/action-items" className="text-sm font-medium text-brand-600 hover:underline">All</Link>
          </div>
          {myActions.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">Nothing assigned to you.</p>
          ) : (
            <ul className="space-y-2">
              {myActions.map((a) => {
                const overdue = a.dueDate < now;
                return (
                  <li key={a.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 p-2.5">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${overdue ? "bg-rose-500" : "bg-amber-500"}`} />
                      <span className="truncate text-sm font-medium text-slate-800">{a.title}</span>
                    </span>
                    <Badge tone={overdue ? "red" : "gray"}>{fmtRelative(a.dueDate)}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-slate-600">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
