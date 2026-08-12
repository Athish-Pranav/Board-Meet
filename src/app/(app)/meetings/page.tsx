import Link from "next/link";
import { requireUser, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { fmtDateTime, cn } from "@/lib/format";
import { noticeSeverity } from "@/lib/compliance";
import { MEETING_TYPES, MEETING_TYPE_LABELS, type MeetingType } from "@/lib/enums";
import { PageHeader, Table, StatusBadge, SeverityBadge, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

type Search = { cat?: string; sub?: string };

export default async function MeetingsPage({ searchParams }: { searchParams: Search }) {
  const user = await requireUser();
  const now = new Date();
  const cat = MEETING_TYPES.includes(searchParams.cat as MeetingType) ? (searchParams.cat as MeetingType) : undefined;
  const sub = searchParams.sub;

  const committees = await prisma.committee.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  
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

  // Build the where clause from category + sub-category.
  const where: Prisma.MeetingWhereInput = {
    deletedAt: null,
    ...restrictionFilter,
  };
  if (cat) where.type = cat;
  if (cat === "Committee" && sub && /^\d+$/.test(sub)) where.committeeId = Number(sub);
  if (sub === "upcoming") {
    where.scheduledAt = { gte: now };
    where.status = { in: ["Scheduled", "InSession", "Draft"] };
  } else if (sub === "past") {
    where.OR = [{ scheduledAt: { lt: now } }, { status: "Concluded" }];
  }

  const [meetings, nextMeeting, lastMeeting] = await Promise.all([
    prisma.meeting.findMany({ where, orderBy: { scheduledAt: "desc" }, include: { committee: { select: { name: true } }, _count: { select: { agendaItems: true } } } }),
    prisma.meeting.findFirst({
      where: {
        deletedAt: null,
        scheduledAt: { gte: now },
        status: { in: ["Scheduled", "InSession", "Draft"] },
        ...restrictionFilter,
      },
      orderBy: { scheduledAt: "asc" },
      select: { id: true }
    }),
    prisma.meeting.findFirst({
      where: {
        deletedAt: null,
        scheduledAt: { lt: now },
        ...restrictionFilter,
      },
      orderBy: { scheduledAt: "desc" },
      select: { id: true }
    }),
  ]);

  const showGrouped = !sub; // group into upcoming/past only when no time sub-filter
  const upcoming = meetings.filter((m) => m.scheduledAt >= now && m.status !== "Concluded");
  const past = meetings.filter((m) => !(m.scheduledAt >= now && m.status !== "Concluded"));

  // Level-1 tabs
  const cats = [{ k: "", l: "All" }, ...MEETING_TYPES.map((t) => ({ k: t, l: MEETING_TYPE_LABELS[t] }))];
  // Level-2 (sub) tabs depend on the selected category
  let subTabs: { k: string; l: string }[] = [];
  if (cat === "Committee") {
    subTabs = [{ k: "", l: "All committees" }, ...committees.map((c) => ({ k: String(c.id), l: c.name }))];
  } else {
    subTabs = [{ k: "", l: "All" }, { k: "upcoming", l: "Upcoming" }, { k: "past", l: "Past" }];
  }

  const subHref = (k: string) => `/meetings?${new URLSearchParams({ ...(cat ? { cat } : {}), ...(k ? { sub: k } : {}) }).toString()}`;

  return (
    <div>
      <PageHeader
        title="Meetings"
        description="Board, committee and general meetings."
        actions={can(user.role, "meetings.create") ? <Link href="/meetings/new" className="btn-primary">+ New meeting</Link> : null}
      />

      {/* Shortcut bar */}
      <div className="mb-4 flex flex-wrap gap-2">
        {nextMeeting ? <Link href={`/meetings/${nextMeeting.id}`} className="btn-secondary btn-sm"><Icon name="calendar" className="h-4 w-4" /> Next meeting</Link> : null}
        {lastMeeting ? <Link href={`/meetings/${lastMeeting.id}`} className="btn-secondary btn-sm"><Icon name="minutes" className="h-4 w-4" /> Last meeting</Link> : null}
        <Link href="/meetings?sub=upcoming" className="btn-secondary btn-sm"><Icon name="clipboard" className="h-4 w-4" /> Scheduled</Link>
        <Link href="/calendar" className="btn-secondary btn-sm"><Icon name="calendar" className="h-4 w-4" /> Calendar</Link>
      </div>

      {/* Level 1: category */}
      <div className="mb-2 flex flex-wrap gap-1">
        {cats.map((t) => {
          const active = (t.k || undefined) === cat;
          return (
            <Link key={t.k} href={t.k ? `/meetings?cat=${t.k}` : "/meetings"} className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", active ? "bg-brand-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100")}>{t.l}</Link>
          );
        })}
      </div>
      {/* Level 2: sub-category */}
      <div className="mb-5 flex flex-wrap gap-1 border-b border-slate-200 pb-3">
        {subTabs.map((t) => {
          const active = (t.k || "") === (sub || "");
          return (
            <Link key={t.k || "all"} href={subHref(t.k)} className={cn("rounded-lg px-2.5 py-1 text-xs font-medium", active ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>{t.l}</Link>
          );
        })}
      </div>

      {meetings.length === 0 ? (
        <EmptyState title="No meetings" hint="Nothing matches this filter." />
      ) : showGrouped ? (
        <div className="space-y-8">
          <MeetingSection title={`Upcoming (${upcoming.length})`} meetings={upcoming} empty="No upcoming meetings." />
          <MeetingSection title={`Past & concluded (${past.length})`} meetings={past} empty="No past meetings." />
        </div>
      ) : (
        <MeetingSection title={`${meetings.length} meeting${meetings.length === 1 ? "" : "s"}`} meetings={meetings} empty="None." />
      )}
    </div>
  );
}

type MeetingRow = {
  id: number;
  title: string;
  type: string;
  status: string;
  scheduledAt: Date;
  noticeSentAt: Date | null;
  shortNoticeConsent: boolean;
  committee: { name: string } | null;
  _count: { agendaItems: number };
};

function MeetingSection({ title, meetings, empty }: { title: string; meetings: MeetingRow[]; empty: string }) {
  if (meetings.length === 0) {
    return (
      <div>
        <h2 className="section-title mb-2">{title}</h2>
        <p className="text-sm text-slate-400">{empty}</p>
      </div>
    );
  }
  return (
    <div>
      <h2 className="section-title mb-2">{title}</h2>
      <Table
        head={
          <>
            <th className="th">Meeting</th>
            <th className="th">Type</th>
            <th className="th">When</th>
            <th className="th">Notice</th>
            <th className="th">Status</th>
          </>
        }
      >
        {meetings.map((m) => {
          const sev = noticeSeverity(m.noticeSentAt, m.scheduledAt, m.shortNoticeConsent);
          return (
            <tr key={m.id} className="hover:bg-slate-50">
              <td className="td">
                <Link href={`/meetings/${m.id}`} className="font-medium text-slate-800 hover:text-brand-700">{m.title}</Link>
                <div className="text-xs text-slate-400">{m.committee?.name ? `${m.committee.name} · ` : ""}{m._count.agendaItems} agenda item{m._count.agendaItems === 1 ? "" : "s"}</div>
              </td>
              <td className="td">{MEETING_TYPE_LABELS[m.type as MeetingType] ?? m.type}</td>
              <td className="td">{fmtDateTime(m.scheduledAt)}</td>
              <td className="td"><SeverityBadge severity={sev}>{sev === "ok" ? "≥ 7 days" : sev === "warn" ? "Short / pending" : "Insufficient"}</SeverityBadge></td>
              <td className="td"><StatusBadge status={m.status} /></td>
            </tr>
          );
        })}
      </Table>
    </div>
  );
}
