import { notFound } from "next/navigation";
import { requireUser, can, assertCommitteeAccess } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { fmtDate, fmtBytes } from "@/lib/format";
import { PageHeader, Card, StatusBadge, SeverityBadge, Badge, Field } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { ATTENDANCE_STATUS, ATTENDANCE_STATUS_LABELS, ATTENDANCE_PRESENT_STATES } from "@/lib/enums";
import { PaperSymbols, PaperSymbolsLegend } from "@/components/PaperSymbols";
import { MeetingTabs } from "../MeetingTabs";
import { setAttendance, togglePresenter, addAttendee } from "./actions";

export const dynamic = "force-dynamic";

export default async function AttendancePage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const id = Number(params.id);
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      quorumRequired: true,
      mode: true,
      deletedAt: true,
      type: true,
      committeeId: true,
    },
  });
  if (!meeting || meeting.deletedAt) notFound();
  await assertCommitteeAccess(user, meeting);

  const [attendanceList, allUsers, latestPack] = await Promise.all([
    prisma.attendance.findMany({
      where: { meetingId: id },
    }),
    prisma.user.findMany({
      where: { deletedAt: null, status: "Active" },
      select: { id: true, name: true, designation: true, isDirector: true },
      orderBy: { name: "asc" },
    }),
    prisma.boardPack.findFirst({
      where: { meetingId: id },
      orderBy: [{ status: "asc" }, { version: "desc" }],
      include: {
        sections: {
          orderBy: { sequence: "asc" },
          include: { document: { select: { id: true, version: true, fileName: true, mimeType: true, classification: true, sizeBytes: true, uploadedAt: true, _count: { select: { annotations: true } } } } },
        },
      },
    }),
  ]);

  const combinedAttendance = allUsers.map((u) => {
    const record = attendanceList.find((a) => a.userId === u.id);
    return {
      id: record?.id ?? null,
      userId: u.id,
      name: u.name,
      designation: u.designation,
      isDirector: u.isDirector,
      status: record?.status ?? "Invited",
      isPresenter: record?.isPresenter ?? false,
    };
  });

  const presentDirectors = combinedAttendance.filter((a) => a.isDirector && ATTENDANCE_PRESENT_STATES.includes(a.status as never)).length;
  const canRecord = can(user.role, "attendance.record");
  const recent = Date.now() - 7 * 86400000;
  const papers = (latestPack?.sections ?? []).filter((s) => s.document);

  return (
    <div>
      <PageHeader
        title={meeting.title}
        description="Participants, attendance & papers"
        actions={
          <SeverityBadge severity={presentDirectors >= meeting.quorumRequired ? "ok" : "warn"}>
            Quorum {presentDirectors}/{meeting.quorumRequired}
          </SeverityBadge>
        }
      />
      <MeetingTabs id={id} mode={meeting.mode} />

      <Card className="overflow-hidden p-0">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Member</th>
              <th className="th">Role</th>
              <th className="th">Status</th>
              {canRecord ? <th className="th">Set</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {combinedAttendance.map((a) => (
              <tr key={a.userId}>
                <td className="td">
                  <span className="font-medium text-slate-800">{a.name}</span>
                  <div className="text-xs text-slate-400">{a.designation || "—"}</div>
                </td>
                <td className="td">
                  <div className="flex flex-wrap gap-1">
                    {a.isDirector ? <Badge tone="blue">Director</Badge> : <Badge tone="gray">Attendee</Badge>}
                    {a.isPresenter ? <Badge tone="purple">Presenter</Badge> : null}
                  </div>
                </td>
                <td className="td"><StatusBadge status={a.status} label={ATTENDANCE_STATUS_LABELS[a.status as keyof typeof ATTENDANCE_STATUS_LABELS] ?? a.status} /></td>
                {canRecord ? (
                  <td className="td">
                    <div className="flex items-center gap-2">
                      <ActionForm action={setAttendance} className="!space-y-0">
                        <input type="hidden" name="meetingId" value={id} />
                        {a.id ? <input type="hidden" name="attendanceId" value={a.id} /> : null}
                        <input type="hidden" name="userId" value={a.userId} />
                        <div className="flex items-center gap-1">
                          <select name="status" defaultValue={a.status} className="input !w-auto py-1 text-xs">
                            {ATTENDANCE_STATUS.map((s) => <option key={s} value={s}>{ATTENDANCE_STATUS_LABELS[s]}</option>)}
                          </select>
                          <button type="submit" className="btn-secondary btn-sm">Save</button>
                        </div>
                      </ActionForm>
                      <ActionForm action={togglePresenter} className="!space-y-0">
                        <input type="hidden" name="meetingId" value={id} />
                        {a.id ? <input type="hidden" name="attendanceId" value={a.id} /> : null}
                        <input type="hidden" name="userId" value={a.userId} />
                        <button type="submit" className="btn-secondary btn-sm" title="Toggle presenter">{a.isPresenter ? "− Presenter" : "+ Presenter"}</button>
                      </ActionForm>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Papers for this meeting, with New / Amended recognition */}
      <Card className="mt-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title">Papers {latestPack ? `(board pack v${latestPack.version}${latestPack.status === "Draft" ? " — draft" : ""})` : ""}</h2>
          <PaperSymbolsLegend />
        </div>
        {papers.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">No papers added to the board pack yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {papers.map((s) => {
              const d = s.document!;
              const isNew = d.version === 1 && d.uploadedAt.getTime() > recent;
              return (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{s.title}</p>
                    <div className="mt-1">
                      <PaperSymbols mimeType={d.mimeType} fileName={d.fileName} classification={d.classification} version={d.version} isNew={isNew} comments={d._count.annotations} restricted={Boolean(s.restrictedToUserId)} />
                      <span className="ml-2 text-xs text-slate-400">{fmtBytes(d.sizeBytes)} · {fmtDate(d.uploadedAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <a href={`/documents/${d.id}/view`} className="btn-secondary btn-sm">View</a>
                    <a href={`/documents/${d.id}/annotate`} className="btn-secondary btn-sm">Annotate</a>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>


    </div>
  );
}
