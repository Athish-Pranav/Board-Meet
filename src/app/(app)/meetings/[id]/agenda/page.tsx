import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, can, assertCommitteeAccess } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader, Card, Badge, StatusBadge } from "@/components/ui";
import { Field } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { cn } from "@/lib/format";
import {
  AGENDA_CLASSIFICATIONS,
  AGENDA_CLASSIFICATION_LABELS,
  DOC_CLASSIFICATIONS,
  type AgendaClassification,
  AGENDA_VOTING_STATUS_LABELS,
  type AgendaVotingStatus,
  MAJORITY_RULES,
  VOTE_CHOICES,
  type VoteChoice,
} from "@/lib/enums";
import { tallyVotes } from "@/lib/compliance";
import { PaperSymbols, PaperSymbolsLegend } from "@/components/PaperSymbols";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { MeetingTabs } from "../MeetingTabs";
import { AgendaItemVoting } from "@/components/AgendaItemVoting";
import { AgendaList } from "./AgendaList";
import {
  addAgendaItem,
  updateAgendaItem,
  removeAgendaItem,
  moveAgendaItem,
  lockAgenda,
  saveDiscussionNote,
  circulateForVote,
  castVote,
  closeVote,
  withdrawVote,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function AgendaPage({ params, searchParams }: { params: { id: string }; searchParams: { view?: string } }) {
  const user = await requireUser();
  const id = Number(params.id);
  const meeting = await prisma.meeting.findUnique({ 
    where: { id }, 
    select: { 
      id: true, 
      title: true, 
      status: true, 
      mode: true, 
      deletedAt: true, 
      agendaStatus: true, 
      agendaFeedback: true,
      type: true,
      committeeId: true,
    } 
  });
  if (!meeting || meeting.deletedAt) notFound();
  await assertCommitteeAccess(user, meeting);

  const [allItems, people, totalVoters, companyNameSetting, myNotes] = await Promise.all([
    prisma.agendaItem.findMany({
      where: { meetingId: id, deletedAt: null },
      orderBy: { sequence: "asc" },
      include: {
        presenter: { select: { name: true } },
        proposedBy: { select: { name: true } },
        documents: { where: { deletedAt: null }, select: { id: true, version: true, mimeType: true, fileName: true, classification: true, _count: { select: { annotations: true } } } },
        votes: { include: { user: { select: { name: true } } }, orderBy: { votedAt: "asc" } },
        _count: { select: { documents: true } },
      },
    }),
    prisma.user.findMany({ where: { deletedAt: null, status: "Active" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.count({ where: { status: "Active", deletedAt: null } }),
    prisma.appSetting.findUnique({ where: { key: "companyName" } }),
    // Private to this user — never another attendee's notes.
    prisma.agendaNote.findMany({
      where: { userId: user.id, agendaItem: { meetingId: id, deletedAt: null } },
      select: { agendaItemId: true, content: true },
    }),
  ]);
  const companyName = companyNameSetting?.value || "Precot Limited";
  const noteByItem = new Map(myNotes.map((n) => [n.agendaItemId, n.content]));

  // Nest sub-items (one level) under their parent, each level kept in sequence order.
  const childrenByParent = new Map<number, typeof allItems>();
  for (const it of allItems) {
    if (it.parentId != null) {
      const list = childrenByParent.get(it.parentId) ?? [];
      list.push(it);
      childrenByParent.set(it.parentId, list);
    }
  }
  const withNote = (it: (typeof allItems)[number]) => ({ ...it, note: noteByItem.get(it.id) ?? null });
  const items = allItems
    .filter((it) => it.parentId == null)
    .map((it) => ({ ...withNote(it), children: (childrenByParent.get(it.id) ?? []).map(withNote) }));

  const locked = allItems.some((i) => i.lockedAt);
  const canDraft = can(user.role, "agenda.draft");
  const canPropose = can(user.role, "agenda.propose");
  const canLock = can(user.role, "agenda.approve") || can(user.role, "agenda.draft");
  const inMeeting = meeting.status === "InSession" || meeting.status === "Concluded";
  const canRecord = can(user.role, "attendance.record");
  const canManageVote = can(user.role, "resolutions.manage");
  const canVote = can(user.role, "vote");



  return (
    <div>
      <PageHeader
        title={meeting.title}
        description="Agenda"
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={locked ? "green" : "gray"}>
              {locked ? "Locked" : "Draft"}
            </Badge>

            {canDraft && !locked ? (
              <ActionForm action={lockAgenda} submitLabel="Lock Agenda" submitVariant="secondary" className="!space-y-0">
                <input type="hidden" name="meetingId" value={id} />
              </ActionForm>
            ) : null}
          </div>
        }
      />
      <MeetingTabs id={id} mode={meeting.mode} />

      {locked ? (
        <div className="mb-6 flex gap-2 border-b border-slate-200 pb-3">
          <Link
            href={`/meetings/${id}/agenda`}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium transition-all",
              searchParams.view !== "contents"
                ? "bg-brand-600 text-white shadow-sm"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            )}
          >
            Agenda Details
          </Link>
          <Link
            href={`/meetings/${id}/agenda?view=contents`}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium transition-all",
              searchParams.view === "contents"
                ? "bg-brand-600 text-white shadow-sm"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            )}
          >
            Table of Contents
          </Link>
        </div>
      ) : null}

      {searchParams.view === "contents" && locked ? (
        <Card className="p-8 max-w-3xl mx-auto shadow-lg border border-slate-200 bg-white min-h-[600px] flex flex-col justify-between">
          <div className="font-serif">
            {/* Document Header */}
            <div className="text-center mb-8">
              <h2 className="text-xs uppercase tracking-[0.2em] font-semibold text-slate-500 mb-2">
                {companyName}
              </h2>
              <h1 className="text-2xl font-bold text-slate-900 tracking-wide mb-1">
                {meeting.title}
              </h1>
              <p className="text-xs text-slate-500 uppercase tracking-widest">
                Table of Contents
              </p>
              <div className="w-16 h-0.5 bg-slate-300 mx-auto mt-4" />
            </div>

            {/* Regular Agenda Items */}
            <div className="space-y-4">
              {items.filter(it => !it.isSupplementary).map((item, idx) => (
                <div key={item.id} className="flex items-baseline gap-2 py-1">
                  <span className="font-semibold text-slate-800 w-6 shrink-0">{idx + 1}.</span>
                  <span className="font-medium text-slate-900 text-base">{item.title}</span>
                  <div className="flex-1 border-b border-dotted border-slate-300 mx-2" />
                  <span className="text-slate-600 text-sm whitespace-nowrap font-sans">
                    {item.presenter?.name || "—"}
                  </span>
                </div>
              ))}
            </div>

            {/* Supplementary Agenda Items */}
            {items.some(it => it.isSupplementary) && (
              <div className="mt-10 border-t border-slate-200 pt-6">
                <h3 className="text-xs font-semibold tracking-[0.15em] uppercase text-amber-700 mb-6 font-sans">
                  Supplementary Agenda
                </h3>
                <div className="space-y-4">
                  {items.filter(it => it.isSupplementary).map((item, idx) => (
                    <div key={item.id} className="flex items-baseline gap-2 py-1">
                      <span className="font-semibold text-amber-800 w-6 shrink-0">S{idx + 1}.</span>
                      <span className="font-medium text-slate-900 text-base">{item.title}</span>
                      <div className="flex-1 border-b border-dotted border-slate-300 mx-2" />
                      <span className="text-slate-600 text-sm whitespace-nowrap font-sans">
                        {item.presenter?.name || "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          {/* Footer of Contents Sheet */}
          <div className="text-center pt-8 border-t border-slate-100 text-[10px] uppercase tracking-widest text-slate-400 font-sans mt-8">
            Page 1 of 1
          </div>
        </Card>
      ) : (
        <>


          {items.length > 0 ? (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <PaperSymbolsLegend />
              {canDraft && !locked ? <span className="text-xs text-slate-400">Drag the ⠿ handle to reorder agenda items.</span> : null}
            </div>
          ) : null}

          {items.length === 0 ? (
            <p className="mb-4 text-sm text-slate-400">No agenda items yet.</p>
          ) : (
            <AgendaList
              meetingId={id}
              items={items as never}
              people={people}
              userId={user.id}
              userName={user.name}
              totalVoters={totalVoters}
              canDraft={canDraft}
              canRecord={canRecord}
              inMeeting={inMeeting}
              locked={locked}
              canVote={canVote}
              canManageVote={canManageVote}
            />
          )}

          {/* Add item */}
          {(canDraft || canPropose) && meeting.status !== "Concluded" ? (
            <Card>
              <h2 className="section-title mb-1">{canDraft ? "Add agenda item" : "Propose an item"}</h2>
              {locked && canDraft ? <p className="mb-3 text-xs text-amber-600">Agenda is locked — new items will be marked supplementary.</p> : null}
              {!canDraft ? <p className="mb-3 text-xs text-slate-500">Proposed items are reviewed by the Company Secretary / Chairman.</p> : null}
              <ActionForm action={addAgendaItem} submitLabel={canDraft ? "Add item" : "Propose item"}>
                <input type="hidden" name="meetingId" value={id} />
                <Field label="Title" required><input name="title" className="input" required placeholder="e.g. Approval of capital expenditure" /></Field>
                <Field label="Description"><textarea name="description" className="input" rows={2} /></Field>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Classification">
                    <select name="classification" className="input" defaultValue="ForDiscussion">
                      {AGENDA_CLASSIFICATIONS.map((c) => <option key={c} value={c}>{AGENDA_CLASSIFICATION_LABELS[c]}</option>)}
                    </select>
                  </Field>
                  <Field label="Majority" hint="If put to a vote">
                    <select name="majorityRule" className="input" defaultValue="Simple">
                      {MAJORITY_RULES.map((m) => <option key={m} value={m}>{m === "Special" ? "Special (≥75%)" : "Simple"}</option>)}
                    </select>
                  </Field>
                  <Field label="Presenter">
                    <select name="presenterId" className="input" defaultValue="">
                      <option value="">None</option>
                      {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Board paper (optional)" hint="PDF / Word / Excel / PPT — added straight to the board pack.">
                    <input type="file" name="file" className="block w-full text-sm" />
                  </Field>
                  <Field label="Paper confidentiality">
                    <select name="docClassification" className="input" defaultValue="Internal">
                      {DOC_CLASSIFICATIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>
                </div>
              </ActionForm>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
