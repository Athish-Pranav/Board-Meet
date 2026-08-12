import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, can, assertCommitteeAccess } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { noticeSeverity, noticeDays, gapDays, RULES, minutesOverdue } from "@/lib/compliance";
import { ATTENDANCE_PRESENT_STATES, MEETING_TYPE_LABELS, MEETING_STATUS_LABELS, ROLE_LABELS, type Role, type MeetingType, type MeetingStatus } from "@/lib/enums";
import { PageHeader, Card, StatusBadge, SeverityBadge, Badge } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { MeetingWorkflow, type Step } from "@/components/MeetingWorkflow";
import { Icon } from "@/components/icons";
import { MeetingTabs } from "./MeetingTabs";
import { sendNotice, startSession, concludeMeeting, cancelMeeting, sendPaperAlert, sendRescheduleAlert, approveMeeting, rejectMeeting } from "../actions";
import { IssueNoticeDialog } from "./IssueNoticeDialog";

export const dynamic = "force-dynamic";

export default async function MeetingOverview({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const id = Number(params.id);
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    include: {
      committee: true,
      createdBy: { select: { name: true } },
      approvedBy: { select: { name: true, role: true } },
      attendance: { include: { user: { select: { name: true, email: true, isDirector: true } } } },
      minutes: { select: { status: true, finalizedAt: true } },
      _count: { select: { agendaItems: true, documents: true } },
    },
  });
  if (!meeting || meeting.deletedAt) notFound();
  await assertCommitteeAccess(user, meeting);

  const users = await prisma.user.findMany({
    where: { deletedAt: null, status: "Active" },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });

  // Resolutions are "For Approval" agenda items.
  const resolutionCount = await prisma.agendaItem.count({ where: { meetingId: id, deletedAt: null, classification: "ForApproval" } });

  const presentDirectors = meeting.attendance.filter(
    (a) => a.user.isDirector && ATTENDANCE_PRESENT_STATES.includes(a.status as never),
  ).length;
  const sev = noticeSeverity(meeting.noticeSentAt, meeting.scheduledAt, meeting.shortNoticeConsent);
  const nDays = noticeDays(meeting.noticeSentAt, meeting.scheduledAt);

  // Gap vs the previous board meeting (s.173(1)) — only meaningful for board meetings.
  let gapInfo: { days: number; breach: boolean } | null = null;
  if (meeting.type === "Board") {
    const prev = await prisma.meeting.findFirst({
      where: { deletedAt: null, type: "Board", scheduledAt: { lt: meeting.scheduledAt } },
      orderBy: { scheduledAt: "desc" },
      select: { scheduledAt: true },
    });
    if (prev) {
      const d = gapDays(prev.scheduledAt, meeting.scheduledAt);
      gapInfo = { days: d, breach: d > RULES.MAX_GAP_DAYS };
    }
  }

  const editable = can(user.role, "meetings.edit");
  const canApprove = can(user.role, "meetings.approve");
  const minutesLate = meeting.status === "Concluded" && minutesOverdue(meeting.scheduledAt, meeting.minutes?.finalizedAt ?? null);

  // Guided workflow: compute which step the secretariat should do next.
  const [agendaLocked, publishedPack] = await Promise.all([
    prisma.agendaItem.findFirst({ where: { meetingId: id, deletedAt: null, lockedAt: { not: null } }, select: { id: true } }),
    prisma.boardPack.findFirst({ where: { meetingId: id, status: "Published" }, select: { id: true } }),
  ]);
  const minutesFinal = meeting.minutes?.status === "Approved" || meeting.minutes?.status === "Published";
  const base = `/meetings/${id}`;
  const doneFlags = [
    Boolean(meeting.noticeSentAt) && sev !== "breach",
    Boolean(agendaLocked),
    Boolean(publishedPack),
    meeting.quorumRequired > 0 && presentDirectors >= meeting.quorumRequired,
    meeting.status === "Concluded",
    Boolean(minutesFinal),
  ];
  const stepDefs = [
    { label: "Issue notice", hint: "≥ 7 days' notice to directors (s.173(3))", href: `${base}#conduct` },
    { label: "Build & lock agenda", hint: "Draft items, then lock to circulate", href: `${base}/agenda` },
    { label: "Publish board pack", hint: "Compile papers into one secure PDF", href: `${base}/board-pack` },
    { label: "Attendance & quorum", hint: "Mark attendance; meet quorum (s.174)", href: `${base}/attendance` },
    { label: "Hold the meeting", hint: "Start the session, then conclude", href: `${base}#conduct` },
    { label: "Finalize minutes", hint: "Draft → approve → file (s.118)", href: `${base}/minutes` },
  ];
  let assignedCurrent = false;
  const steps: Step[] = stepDefs.map((d, i) => {
    let status: Step["status"];
    if (doneFlags[i]) status = "done";
    else if (!assignedCurrent) { status = "current"; assignedCurrent = true; }
    else status = "todo";
    return { ...d, status };
  });

  return (
    <div>
      <PageHeader
        title={meeting.title}
        description={`${MEETING_TYPE_LABELS[meeting.type as MeetingType] ?? meeting.type}${meeting.committee ? ` · ${meeting.committee.name}` : ""}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={meeting.status} label={MEETING_STATUS_LABELS[meeting.status as MeetingStatus]} />
            <Badge tone={meeting.approvalStatus === "Approved" ? "green" : meeting.approvalStatus === "Rejected" ? "red" : "amber"}>
              Approval: {meeting.approvalStatus}
            </Badge>
            {editable && meeting.status !== "Concluded" ? (
              <Link href={`/meetings/${id}/edit`} className="btn-secondary">Edit</Link>
            ) : null}
          </div>
        }
      />

      <MeetingTabs id={id} mode={meeting.mode} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <h2 className="section-title mb-3">Details</h2>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Detail label="Date & time" value={fmtDateTime(meeting.scheduledAt)} />
              <Detail label="Mode" value={meeting.mode} />
              <Detail label="Venue" value={meeting.venue || "—"} />
              <Detail
                label="Meeting link"
                value={
                  meeting.meetingLink ? (
                    <a href={meeting.meetingLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                      <Icon name="link" className="h-4 w-4" /> Join
                    </a>
                  ) : "—"
                }
              />
              <Detail label="Scheduled by" value={meeting.createdBy.name} />
              <Detail label="Created" value={fmtDate(meeting.createdAt)} />
            </dl>
            {meeting.description ? <p className="mt-4 whitespace-pre-wrap text-sm text-slate-600">{meeting.description}</p> : null}

            <div className="mt-5 flex flex-wrap gap-3 border-t border-slate-100 pt-4 text-sm">
              <Link href={`/meetings/${id}/agenda`} className="text-brand-600 hover:underline">{meeting._count.agendaItems} agenda items →</Link>
              <Link href={`/meetings/${id}/board-pack`} className="text-brand-600 hover:underline">Board pack →</Link>
              <Link href={`/meetings/${id}/attendance`} className="text-brand-600 hover:underline">Attendance →</Link>
              <Link href={`/resolutions?meeting=${id}`} className="text-brand-600 hover:underline">{resolutionCount} resolutions →</Link>
            </div>
          </Card>

          {canApprove || meeting.approvalStatus !== "Pending" ? (
            <Card>
              <h2 className="section-title mb-3">Approval Sign-off</h2>
              {meeting.approvalStatus === "Pending" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                    <p className="mb-2 text-sm font-medium text-emerald-800">Approve this meeting</p>
                    <ActionForm action={approveMeeting} submitLabel="Approve" successToast="Meeting approved">
                      <input type="hidden" name="id" value={id} />
                      <input name="note" className="input" placeholder="Note (optional)" />
                    </ActionForm>
                  </div>
                  <div className="rounded-lg border border-red-200 bg-red-50/60 p-3">
                    <p className="mb-2 text-sm font-medium text-red-800">Request changes</p>
                    <ActionForm action={rejectMeeting} submitLabel="Reject" submitVariant="danger" successToast="Meeting rejected">
                      <input type="hidden" name="id" value={id} />
                      <input name="note" className="input" placeholder="Reason (optional)" />
                    </ActionForm>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-600">
                  {meeting.approvalStatus} {meeting.approvedBy ? `by ${meeting.approvedBy.name} (${ROLE_LABELS[meeting.approvedBy.role as Role] || meeting.approvedBy.role})` : ""} {meeting.approvedAt ? `on ${fmtDateTime(meeting.approvedAt)}` : ""}
                  {meeting.approvalNote ? <span className="block text-xs text-slate-500">Note: {meeting.approvalNote}</span> : null}
                </p>
              )}
            </Card>
          ) : null}

          {meeting.recordingKey ? (
            <Card className="overflow-hidden">
              <h2 className="section-title mb-3">Meeting Recording</h2>
              <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-950 aspect-video flex flex-col justify-center items-center">
                <video
                  src={`/api/meetings/${id}/recording/stream`}
                  controls
                  className="w-full h-full"
                  preload="metadata"
                />
              </div>
            </Card>
          ) : null}

          <div id="conduct" className="scroll-mt-24" />
          {editable ? (
            <Card>
              <h2 className="section-title mb-3">Conduct of meeting</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {meeting.status === "Scheduled" || meeting.status === "Draft" ? (
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="mb-2 text-sm font-medium text-slate-700">Start session</p>
                    <p className="mb-2 text-xs text-slate-500">Quorum is checked (s.174) before the meeting can begin.</p>
                    <ActionForm action={startSession} submitLabel="Mark in session">
                      <input type="hidden" name="id" value={id} />
                    </ActionForm>
                  </div>
                ) : null}
                {meeting.status === "InSession" ? (
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="mb-2 text-sm font-medium text-slate-700">Conclude meeting</p>
                    <p className="mb-2 text-xs text-slate-500">Opens a minutes draft; the 30-day clock (s.118) starts.</p>
                    <ActionForm action={concludeMeeting} submitLabel="Conclude" submitVariant="secondary">
                      <input type="hidden" name="id" value={id} />
                    </ActionForm>
                  </div>
                ) : null}
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="mb-2 text-sm font-medium text-slate-700">Issue notice</p>
                  <IssueNoticeDialog
                    meeting={meeting}
                    users={users}
                    defaultEmails={meeting.attendance.map((a) => a.user.email)}
                  />
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="mb-1 text-sm font-medium text-slate-700">Pre-defined email alerts</p>
                  <p className="mb-2 text-xs text-slate-500">Sends to all invitees. Reschedule alerts also fire automatically when you change the date.</p>
                  <div className="flex flex-wrap gap-2">
                    <ActionForm action={sendPaperAlert} submitLabel="Paper alert" submitVariant="secondary" className="!space-y-0">
                      <input type="hidden" name="id" value={id} />
                    </ActionForm>
                    <ActionForm action={sendRescheduleAlert} submitLabel="Reschedule alert" submitVariant="secondary" className="!space-y-0">
                      <input type="hidden" name="id" value={id} />
                    </ActionForm>
                  </div>
                </div>
                {meeting.status !== "Concluded" ? (
                  <div className="rounded-lg border border-red-100 p-3">
                    <p className="mb-2 text-sm font-medium text-red-700">Cancel meeting</p>
                    <p className="mb-2 text-xs text-slate-500">Soft-deletes the meeting; the record is retained.</p>
                    <ActionForm action={cancelMeeting} successToast="Meeting cancelled">
                      <input type="hidden" name="id" value={id} />
                      <ConfirmSubmit confirmLabel="Yes, cancel meeting">Cancel meeting</ConfirmSubmit>
                    </ActionForm>
                  </div>
                ) : null}
              </div>
            </Card>
          ) : null}
        </div>

        {/* Side panel: guided workflow + compliance */}
        <div className="space-y-5">
          <MeetingWorkflow steps={steps} />
          <Card>
            <h2 className="section-title mb-3">Compliance</h2>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-700">Notice period</p>
                  <p className="text-xs text-slate-500">
                    {nDays === null ? "Notice not issued yet" : `${nDays} days' notice given (min ${RULES.MIN_NOTICE_DAYS})`}
                  </p>
                </div>
                <SeverityBadge severity={sev}>{sev === "ok" ? "OK" : sev === "warn" ? "Check" : "Breach"}</SeverityBadge>
              </li>
              <li className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-700">Quorum (s.174)</p>
                  <p className="text-xs text-slate-500">{presentDirectors} present / {meeting.quorumRequired} required</p>
                </div>
                <SeverityBadge severity={presentDirectors >= meeting.quorumRequired ? "ok" : "warn"}>
                  {presentDirectors >= meeting.quorumRequired ? "Met" : "Pending"}
                </SeverityBadge>
              </li>
              {gapInfo ? (
                <li className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-700">Gap since last board meeting</p>
                    <p className="text-xs text-slate-500">{gapInfo.days} days (max {RULES.MAX_GAP_DAYS}, s.173(1))</p>
                  </div>
                  <SeverityBadge severity={gapInfo.breach ? "breach" : "ok"}>{gapInfo.breach ? "Breach" : "OK"}</SeverityBadge>
                </li>
              ) : null}
              <li className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-700">Minutes (s.118)</p>
                  <p className="text-xs text-slate-500">
                    {meeting.minutes ? `Status: ${meeting.minutes.status}` : "Not started"}
                  </p>
                </div>
                {meeting.status === "Concluded" ? (
                  <SeverityBadge severity={minutesLate ? "breach" : meeting.minutes?.finalizedAt ? "ok" : "warn"}>
                    {minutesLate ? "Overdue" : meeting.minutes?.finalizedAt ? "Final" : "30-day"}
                  </SeverityBadge>
                ) : (
                  <Badge tone="gray">—</Badge>
                )}
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-700">{value}</dd>
    </div>
  );
}
