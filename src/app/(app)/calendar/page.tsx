import Link from "next/link";
import { requireUser } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/format";
import { MEETING_TYPE_LABELS, type MeetingType } from "@/lib/enums";
import { PageHeader, Card } from "@/components/ui";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  isSameMonth, isSameDay, addMonths, format, parse, isValid,
} from "date-fns";

export const dynamic = "force-dynamic";

const TYPE_TONE: Record<string, string> = {
  Board: "bg-brand-100 text-brand-800 hover:bg-brand-200",
  Committee: "bg-violet-100 text-violet-800 hover:bg-violet-200",
  General: "bg-amber-100 text-amber-800 hover:bg-amber-200",
};

export default async function CalendarPage({ searchParams }: { searchParams: { ym?: string } }) {
  await requireUser();
  const now = new Date();

  const parsed = searchParams.ym ? parse(searchParams.ym, "yyyy-MM", new Date()) : now;
  const base = isValid(parsed) ? parsed : now;

  const monthStart = startOfMonth(base);
  const monthEnd = endOfMonth(base);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const meetings = await prisma.meeting.findMany({
    where: { deletedAt: null, scheduledAt: { gte: gridStart, lte: gridEnd } },
    select: { id: true, title: true, type: true, scheduledAt: true, status: true },
    orderBy: { scheduledAt: "asc" },
  });
  const byDay = new Map<string, typeof meetings>();
  for (const m of meetings) {
    const key = format(m.scheduledAt, "yyyy-MM-dd");
    (byDay.get(key) ?? byDay.set(key, []).get(key)!).push(m);
  }

  // 12-month strip: 3 months back .. 8 months forward
  const strip = Array.from({ length: 12 }, (_, i) => addMonths(startOfMonth(now), i - 3));
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div>
      <PageHeader title="Calendar" description="One-tap access to meetings across the year." />

      {/* 12-month strip */}
      <div className="mb-4 flex gap-1 overflow-x-auto pb-1">
        {strip.map((d) => {
          const ym = format(d, "yyyy-MM");
          const active = isSameMonth(d, base);
          return (
            <Link key={ym} href={`/calendar?ym=${ym}`} className={cn("shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium", active ? "bg-brand-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100")}>
              {format(d, "MMM ''yy")}
            </Link>
          );
        })}
      </div>

      <Card className="p-3 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <Link href={`/calendar?ym=${format(addMonths(base, -1), "yyyy-MM")}`} className="btn-secondary btn-sm">← Prev</Link>
          <h2 className="text-lg font-semibold text-slate-900">{format(base, "MMMM yyyy")}</h2>
          <Link href={`/calendar?ym=${format(addMonths(base, 1), "yyyy-MM")}`} className="btn-secondary btn-sm">Next →</Link>
        </div>

        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg bg-slate-200 text-center">
          {weekdays.map((w) => (
            <div key={w} className="bg-slate-50 py-2 text-xs font-semibold text-slate-500">{w}</div>
          ))}
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayMeetings = byDay.get(key) ?? [];
            const inMonth = isSameMonth(day, base);
            const today = isSameDay(day, now);
            return (
              <div key={key} className={cn("min-h-[92px] bg-white p-1.5 text-left", !inMonth && "bg-slate-50/60")}>
                <div className={cn("mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs", today ? "bg-brand-600 font-bold text-white" : inMonth ? "text-slate-700" : "text-slate-300")}>
                  {format(day, "d")}
                </div>
                <div className="space-y-1">
                  {dayMeetings.map((m) => (
                    <Link key={m.id} href={`/meetings/${m.id}`} title={`${MEETING_TYPE_LABELS[m.type as MeetingType]} · ${format(m.scheduledAt, "h:mm a")}`} className={cn("block truncate rounded px-1.5 py-0.5 text-[11px] font-medium", TYPE_TONE[m.type] ?? "bg-slate-100 text-slate-700")}>
                      {format(m.scheduledAt, "HH:mm")} {m.title}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-brand-200" /> Board</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-violet-200" /> Committee</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-amber-200" /> General</span>
        </div>
      </Card>
    </div>
  );
}
