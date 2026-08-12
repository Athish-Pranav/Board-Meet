import { redirect } from "next/navigation";
import { requireUser } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { ATTENDANCE_PRESENT_STATES, AGENDA_VOTING_STATUS_LABELS, type AgendaVotingStatus } from "@/lib/enums";
import { PageHeader, Card, Table, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const user = await requireUser();
  if (!["CompanySecretary", "CFO", "Chairman", "ManagingDirector"].includes(user.role)) redirect("/403");
  const now = new Date();

  const [meetingsByStatus, resByStatus, openActions, directors, concludedMeetings, pendingMinutes, pendingResolutions] = await Promise.all([
    prisma.meeting.groupBy({ by: ["status"], where: { deletedAt: null }, _count: true }),
    prisma.agendaItem.groupBy({ by: ["votingStatus"], where: { deletedAt: null, classification: "ForApproval" }, _count: true }),
    prisma.actionItem.findMany({ where: { deletedAt: null, status: { not: "Done" } }, select: { dueDate: true } }),
    prisma.user.findMany({ where: { isDirector: true, deletedAt: null }, select: { id: true, name: true } }),
    prisma.meeting.findMany({ where: { deletedAt: null, status: "Concluded" }, select: { id: true } }),
    prisma.minutes.count({ where: { status: "Circulated" } }),
    prisma.agendaItem.count({ where: { deletedAt: null, classification: "ForApproval", votingStatus: "Circulated" } }),
  ]);

  // Attendance % per director across concluded meetings.
  const concludedIds = concludedMeetings.map((m) => m.id);
  const attendance = await prisma.attendance.findMany({
    where: { meetingId: { in: concludedIds.length ? concludedIds : [-1] } },
    select: { userId: true, status: true },
  });
  const attRows = directors
    .map((d) => {
      const recs = attendance.filter((a) => a.userId === d.id);
      const present = recs.filter((a) => ATTENDANCE_PRESENT_STATES.includes(a.status as never)).length;
      const total = recs.length;
      const pct = total ? Math.round((present / total) * 100) : null;
      return { name: d.name, present, total, pct };
    })
    .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));

  // Action aging buckets
  const buckets = { overdue: 0, soon: 0, later: 0 };
  for (const a of openActions) {
    const days = Math.ceil((a.dueDate.getTime() - now.getTime()) / 86400000);
    if (days < 0) buckets.overdue++;
    else if (days <= 7) buckets.soon++;
    else buckets.later++;
  }

  return (
    <div>
      <PageHeader title="Reports & Dashboards" description="Board effectiveness and pipeline at a glance." />

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Pending minutes approvals" value={pendingMinutes} />
        <Stat label="Resolutions awaiting close" value={pendingResolutions} />
        <Stat label="Open actions overdue" value={buckets.overdue} tone={buckets.overdue ? "red" : "green"} />
        <Stat label="Open actions due ≤7d" value={buckets.soon} tone={buckets.soon ? "amber" : "green"} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="section-title mb-3">Attendance by director</h2>
          {attRows.length === 0 ? (
            <p className="text-sm text-slate-400">No directors recorded.</p>
          ) : (
            <Table head={<><th className="th">Director</th><th className="th">Present</th><th className="th">Attendance %</th></>}>
              {attRows.map((r) => (
                <tr key={r.name}>
                  <td className="td font-medium text-slate-800">{r.name}</td>
                  <td className="td">{r.present}/{r.total}</td>
                  <td className="td">
                    {r.pct === null ? <span className="text-slate-300">—</span> : (
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                          <div className={`h-full ${r.pct >= 75 ? "bg-emerald-500" : r.pct >= 50 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${r.pct}%` }} />
                        </div>
                        <span className="text-sm font-medium text-slate-600">{r.pct}%</span>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <div className="space-y-5">
          <Card>
            <h2 className="section-title mb-3">Meetings by status</h2>
            <div className="flex flex-wrap gap-2">
              {meetingsByStatus.map((m) => (
                <Badge key={m.status} tone="blue">{m.status}: {m._count}</Badge>
              ))}
              {meetingsByStatus.length === 0 ? <span className="text-sm text-slate-400">No meetings.</span> : null}
            </div>
          </Card>
          <Card>
            <h2 className="section-title mb-3">Resolutions by status</h2>
            <div className="flex flex-wrap gap-2">
              {resByStatus.map((r) => (
                <Badge key={r.votingStatus} tone="purple">{AGENDA_VOTING_STATUS_LABELS[r.votingStatus as AgendaVotingStatus]}: {r._count}</Badge>
              ))}
              {resByStatus.length === 0 ? <span className="text-sm text-slate-400">No resolutions.</span> : null}
            </div>
          </Card>
          <Card>
            <h2 className="section-title mb-3">Action item aging</h2>
            <div className="flex flex-wrap gap-2">
              <Badge tone="red">Overdue: {buckets.overdue}</Badge>
              <Badge tone="amber">Due ≤ 7 days: {buckets.soon}</Badge>
              <Badge tone="gray">Later: {buckets.later}</Badge>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "blue" }: { label: string; value: React.ReactNode; tone?: "blue" | "amber" | "red" | "green" }) {
  const c = { blue: "text-brand-600", amber: "text-amber-600", red: "text-red-600", green: "text-emerald-600" }[tone];
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${c}`}>{value}</p>
    </Card>
  );
}
