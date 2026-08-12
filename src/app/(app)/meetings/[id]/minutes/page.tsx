import { notFound } from "next/navigation";
import { requireUser, can, assertCommitteeAccess } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { minutesDeadline, minutesOverdue, minutesDaysRemaining } from "@/lib/compliance";
import { PageHeader, Card, StatusBadge, SeverityBadge, Field } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { MeetingTabs } from "../MeetingTabs";
import { saveMinutesDraft, circulateMinutes, commentMinutes, approveMinutes, publishMinutes, addAddendum, uploadMinutesFile, removeMinutesFile } from "./actions";

export const dynamic = "force-dynamic";

export default async function MinutesPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const id = Number(params.id);
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      status: true,
      scheduledAt: true,
      mode: true,
      deletedAt: true,
      type: true,
      committeeId: true,
    },
  });
  if (!meeting || meeting.deletedAt) notFound();
  await assertCommitteeAccess(user, meeting);

  const [minutes, allItems] = await Promise.all([
    prisma.minutes.findUnique({
      where: { meetingId: id },
      include: {
        signedBy: { select: { name: true } },
        comments: { include: { user: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
        addenda: { include: { createdBy: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
        documents: { where: { deletedAt: null }, include: { uploadedBy: { select: { name: true } } }, orderBy: { uploadedAt: "desc" } },
      },
    }),
    prisma.agendaItem.findMany({
      where: { meetingId: id, deletedAt: null },
      orderBy: { sequence: "asc" },
    }),
  ]);

  const childrenByParent = new Map<number, typeof allItems>();
  for (const it of allItems) {
    if (it.parentId != null) {
      const list = childrenByParent.get(it.parentId) ?? [];
      list.push(it);
      childrenByParent.set(it.parentId, list);
    }
  }
  const items = allItems
    .filter((it) => it.parentId == null)
    .map((it) => ({ ...it, children: childrenByParent.get(it.id) ?? [] }));

  let compiledText = "";
  items.forEach((item, idx) => {
    const itemNum = `${idx + 1}`;
    compiledText += `${itemNum}. ${item.title}\n`;
    if (item.discussionNote) {
      compiledText += `   Minutes: ${item.discussionNote}\n`;
    } else {
      compiledText += `   Minutes: (No minutes recorded)\n`;
    }
    compiledText += `\n`;
    
    item.children.forEach((child, ci) => {
      const subNum = `${itemNum}.${ci + 1}`;
      compiledText += `   ${subNum}. ${child.title}\n`;
      if (child.discussionNote) {
        compiledText += `      Minutes: ${child.discussionNote}\n`;
      } else {
        compiledText += `      Minutes: (No minutes recorded)\n`;
      }
      compiledText += `\n`;
    });
  });

  const status = minutes?.status ?? "Draft";
  const isDraft = status === "Draft";
  const isFinal = status === "Approved" || status === "Published";
  const canDraft = can(user.role, "minutes.draft");
  const canCirculate = can(user.role, "minutes.circulate");
  const canComment = can(user.role, "minutes.comment");
  const canApprove = can(user.role, "minutes.approve");

  const deadline = minutesDeadline(meeting.scheduledAt);
  const overdue = meeting.status === "Concluded" && minutesOverdue(meeting.scheduledAt, minutes?.finalizedAt ?? null);
  const daysLeft = minutesDaysRemaining(meeting.scheduledAt);

  return (
    <div>
      <PageHeader
        title={meeting.title}
        description="Minutes"
        actions={<StatusBadge status={status} />}
      />
      <MeetingTabs id={id} mode={meeting.mode} />

      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm">
        <span className="text-slate-500">s.118 deadline:</span>
        <span className="font-medium text-slate-700">{fmtDate(deadline)}</span>
        {meeting.status === "Concluded" ? (
          <SeverityBadge severity={overdue ? "breach" : minutes?.finalizedAt ? "ok" : daysLeft <= 7 ? "warn" : "ok"}>
            {minutes?.finalizedAt ? `Finalized ${fmtDate(minutes.finalizedAt)}` : overdue ? "Overdue" : `${daysLeft} days left`}
          </SeverityBadge>
        ) : (
          <span className="text-xs text-slate-400">Clock starts when the meeting is concluded.</span>
        )}
        {minutes?.signedBy ? <span className="text-xs text-slate-400">Signed by {minutes.signedBy.name}</span> : null}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            {isDraft && canDraft ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="section-title !mb-0">Draft minutes</h2>
                  <button
                    type="button"
                    id="sync-agenda-btn"
                    className="btn-secondary btn-sm"
                    title="Load/Sync the latest compiled minutes from the agenda"
                  >
                    🔄 Sync with Agenda
                  </button>
                </div>
                <ActionForm action={saveMinutesDraft} submitLabel="Save draft" submitVariant="secondary">
                  <input type="hidden" name="meetingId" value={id} />
                  <textarea
                    id="minutes-editor-textarea"
                    name="content"
                    rows={16}
                    className="input font-mono text-sm"
                    defaultValue={minutes?.content || compiledText}
                    placeholder="Record proceedings, decisions and resolutions…"
                  />
                </ActionForm>
                {minutes?.content ? (
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <ActionForm action={circulateMinutes} submitLabel="Circulate to directors">
                      <input type="hidden" name="meetingId" value={id} />
                    </ActionForm>
                  </div>
                ) : null}
                <script
                  dangerouslySetInnerHTML={{
                    __html: `
                      (function() {
                        const btn = document.getElementById('sync-agenda-btn');
                        if (btn) {
                          btn.onclick = function() {
                            const txt = document.getElementById('minutes-editor-textarea');
                            if (txt) {
                              txt.value = ${JSON.stringify(compiledText)};
                            }
                          };
                        }
                      })();
                    `
                  }}
                />
              </>
            ) : (
              <>
                <h2 className="section-title mb-3">Minutes {isFinal ? "(final — immutable)" : "(circulated)"}</h2>
                <div className="whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
                  {minutes?.content || "—"}
                </div>

                {status === "Circulated" && canApprove ? (
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <ActionForm action={approveMinutes} submitLabel="Approve & sign as Chairman">
                      <input type="hidden" name="meetingId" value={id} />
                    </ActionForm>
                  </div>
                ) : null}
                {status === "Approved" && canCirculate ? (
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <ActionForm action={publishMinutes} submitLabel="Enter into minute book (publish)">
                      <input type="hidden" name="meetingId" value={id} />
                    </ActionForm>
                  </div>
                ) : null}
              </>
            )}
          </Card>

          {/* Attachments */}
          <Card className="mt-5">
            <h2 className="section-title mb-3">Attachments</h2>
            {minutes?.documents.length ? (
              <ul className="mb-4 divide-y divide-slate-100">
                {minutes.documents.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <a href={`/documents/${d.id}/view`} className="block truncate text-sm font-medium text-brand-700 hover:underline">{d.title}</a>
                      <p className="text-xs text-slate-400">{d.fileName} · {(d.sizeBytes / 1024).toFixed(0)} KB · {d.uploadedBy.name}</p>
                    </div>
                    {canDraft ? (
                      <ActionForm action={removeMinutesFile} className="!space-y-0 shrink-0" successToast="Attachment removed">
                        <input type="hidden" name="meetingId" value={id} />
                        <input type="hidden" name="docId" value={d.id} />
                        <ConfirmSubmit>Remove</ConfirmSubmit>
                      </ActionForm>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-4 text-sm text-slate-400">No files attached. Upload supporting documents or the signed scanned minutes.</p>
            )}
            {canDraft ? (
              <ActionForm action={uploadMinutesFile} submitLabel="Upload file" submitVariant="secondary" successToast="File uploaded">
                <input type="hidden" name="meetingId" value={id} />
                <Field label="File" required><input type="file" name="file" className="block w-full text-sm" required /></Field>
                <Field label="Title"><input name="title" className="input" placeholder="Defaults to file name" /></Field>
              </ActionForm>
            ) : null}
          </Card>

          {/* Auto-Compiled Minutes */}
          <Card className="mt-5">
            <h2 className="section-title mb-3">Auto-Compiled Minutes (from Agenda)</h2>
            <div className="whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm leading-relaxed text-slate-700 font-mono border border-slate-100">
              {compiledText || "No minutes recorded in the agenda."}
            </div>
          </Card>

          {/* Addenda */}
          {isFinal ? (
            <Card className="mt-5">
              <h2 className="section-title mb-3">Addenda (corrections)</h2>
              {minutes?.addenda.length ? (
                <ul className="mb-4 space-y-3">
                  {minutes.addenda.map((a) => (
                    <li key={a.id} className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm">
                      <p className="whitespace-pre-wrap text-slate-700">{a.content}</p>
                      <p className="mt-1 text-xs text-slate-400">{a.createdBy.name} · {fmtDateTime(a.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-4 text-sm text-slate-400">No addenda. Finalized minutes are immutable; record any correction as an addendum.</p>
              )}
              {canDraft ? (
                <ActionForm action={addAddendum} submitLabel="Add addendum" submitVariant="secondary">
                  <input type="hidden" name="meetingId" value={id} />
                  <Field label="Correction / addendum"><textarea name="content" rows={3} className="input" /></Field>
                </ActionForm>
              ) : null}
            </Card>
          ) : null}
        </div>

        {/* Comments */}
        <div>
          <Card>
            <h2 className="section-title mb-3">Review comments</h2>
            {minutes?.comments.length ? (
              <ul className="mb-4 space-y-3">
                {minutes.comments.map((c) => (
                  <li key={c.id} className="rounded-lg border border-slate-100 p-3 text-sm">
                    <p className="whitespace-pre-wrap text-slate-700">{c.comment}</p>
                    <p className="mt-1 text-xs text-slate-400">{c.user.name} · {fmtDateTime(c.createdAt)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-4 text-sm text-slate-400">No comments yet.</p>
            )}
            {canComment && (status === "Circulated") ? (
              <ActionForm action={commentMinutes} submitLabel="Add comment" submitVariant="secondary">
                <input type="hidden" name="meetingId" value={id} />
                <textarea name="comment" rows={3} className="input" placeholder="Your comment on the draft minutes…" />
              </ActionForm>
            ) : null}
          </Card>
        </div>
      </div>
    </div>
  );
}
