import Link from "next/link";
import { requireUser } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { fmtDate } from "@/lib/format";
import { RULES, gapDays, noticeSeverity, minutesOverdue, minutesDaysRemaining } from "@/lib/compliance";
import { PageHeader, Card, SeverityBadge, Badge } from "@/components/ui";
import { Icon } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function CompliancePage() {
  await requireUser();
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59);

  const [boardThisYear, recentBoard, upcoming, concluded] = await Promise.all([
    prisma.meeting.count({ where: { deletedAt: null, type: "Board", scheduledAt: { gte: yearStart, lte: yearEnd } } }),
    prisma.meeting.findMany({
      where: { deletedAt: null, type: "Board", scheduledAt: { gte: new Date(now.getFullYear() - 1, now.getMonth(), 1) } },
      orderBy: { scheduledAt: "asc" },
      select: { id: true, title: true, scheduledAt: true },
    }),
    prisma.meeting.findMany({
      where: { deletedAt: null, scheduledAt: { gte: now }, status: { in: ["Scheduled", "InSession", "Draft"] } },
      orderBy: { scheduledAt: "asc" },
      select: { id: true, title: true, scheduledAt: true, noticeSentAt: true, shortNoticeConsent: true, quorumRequired: true, quorumMet: true },
    }),
    prisma.meeting.findMany({
      where: { deletedAt: null, status: "Concluded" },
      orderBy: { scheduledAt: "desc" },
      select: { id: true, title: true, scheduledAt: true, minutes: { select: { status: true, finalizedAt: true } } },
    }),
  ]);

  // Consecutive gaps between board meetings
  const gaps: { from: string; to: string; days: number; breach: boolean }[] = [];
  for (let i = 1; i < recentBoard.length; i++) {
    const d = gapDays(recentBoard[i - 1].scheduledAt, recentBoard[i].scheduledAt);
    gaps.push({ from: recentBoard[i - 1].title, to: recentBoard[i].title, days: d, breach: d > RULES.MAX_GAP_DAYS });
  }
  const overdueMinutes = concluded.filter((m) => minutesOverdue(m.scheduledAt, m.minutes?.finalizedAt ?? null, now));

  return (
    <div>
      <PageHeader title="Compliance" description="Companies Act 2013 checks surfaced as live rules. Have your Company Secretary validate against the current Act & SS-1." />

      {env.company.isListed ? (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Icon name="warning" className="mt-0.5 h-5 w-5" />
          <span>Company is flagged as <strong>listed</strong>. SEBI LODR (committee composition, disclosure timelines) applies and is out of scope of these checks — confirm with counsel.</span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="section-title mb-1">Annual cadence (s.173(1))</h2>
          <p className="mb-3 text-sm text-slate-500">Minimum {RULES.MIN_BOARD_MEETINGS_PER_YEAR} board meetings per calendar year.</p>
          <div className="flex items-center gap-3">
            <span className="text-3xl font-bold text-brand-600">{boardThisYear}</span>
            <span className="text-sm text-slate-500">board meetings in {now.getFullYear()}</span>
            <SeverityBadge severity={boardThisYear >= RULES.MIN_BOARD_MEETINGS_PER_YEAR ? "ok" : "warn"}>
              {boardThisYear >= RULES.MIN_BOARD_MEETINGS_PER_YEAR ? "On track" : `${RULES.MIN_BOARD_MEETINGS_PER_YEAR - boardThisYear} more needed`}
            </SeverityBadge>
          </div>
        </Card>

        <Card>
          <h2 className="section-title mb-1">Gaps between board meetings</h2>
          <p className="mb-3 text-sm text-slate-500">No more than {RULES.MAX_GAP_DAYS} days between consecutive meetings.</p>
          {gaps.length === 0 ? (
            <p className="text-sm text-slate-400">Need at least two board meetings to measure a gap.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {gaps.slice(-5).map((g, i) => (
                <li key={i} className="flex items-center justify-between">
                  <span className="truncate text-slate-600">{g.from} → {g.to}</span>
                  <SeverityBadge severity={g.breach ? "breach" : "ok"}>{g.days} days</SeverityBadge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="section-title mb-1">Notice & quorum — upcoming</h2>
          <p className="mb-3 text-sm text-slate-500">7-day notice (s.173(3)) and quorum (s.174).</p>
          {upcoming.length === 0 ? (
            <p className="text-sm text-slate-400">No upcoming meetings.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {upcoming.map((m) => {
                const sev = noticeSeverity(m.noticeSentAt, m.scheduledAt, m.shortNoticeConsent);
                return (
                  <li key={m.id} className="flex items-center justify-between gap-2">
                    <Link href={`/meetings/${m.id}`} className="truncate text-slate-700 hover:text-brand-700">{m.title}</Link>
                    <div className="flex shrink-0 items-center gap-1">
                      <SeverityBadge severity={sev}>Notice</SeverityBadge>
                      <SeverityBadge severity={m.quorumMet ? "ok" : "warn"}>Quorum</SeverityBadge>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="section-title mb-1">Minutes (s.118)</h2>
          <p className="mb-3 text-sm text-slate-500">Enter minutes in the minute book within {RULES.MINUTES_FINALIZE_DAYS} days.</p>
          {concluded.length === 0 ? (
            <p className="text-sm text-slate-400">No concluded meetings yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {concluded.slice(0, 6).map((m) => {
                const late = minutesOverdue(m.scheduledAt, m.minutes?.finalizedAt ?? null, now);
                const left = minutesDaysRemaining(m.scheduledAt, now);
                return (
                  <li key={m.id} className="flex items-center justify-between gap-2">
                    <Link href={`/meetings/${m.id}/minutes`} className="truncate text-slate-700 hover:text-brand-700">{m.title}</Link>
                    <SeverityBadge severity={m.minutes?.finalizedAt ? "ok" : late ? "breach" : left <= 7 ? "warn" : "ok"}>
                      {m.minutes?.finalizedAt ? "Final" : late ? "Overdue" : `${left}d left`}
                    </SeverityBadge>
                  </li>
                );
              })}
            </ul>
          )}
          {overdueMinutes.length > 0 ? <p className="mt-3 text-xs text-red-600">{overdueMinutes.length} meeting(s) breach the 30-day rule.</p> : null}
        </Card>
      </div>

      <Card className="mt-5">
        <h2 className="section-title mb-2">Records retention</h2>
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <Badge tone="green">Minutes: permanent — never auto-deleted</Badge>
          <Badge tone="green">Resolutions: permanent</Badge>
          <Badge tone="gray">Policies / committee papers: archive per policy</Badge>
          <Link href="/settings" className="text-brand-600 hover:underline">Manage retention policies →</Link>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          SS-1 (issued by ICSI) governs the detailed form of notice, agenda and minutes and is amended periodically — have your
          Company Secretary review generated templates against the current text.
        </p>
      </Card>
    </div>
  );
}
