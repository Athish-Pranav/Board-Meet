"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/lib/format";
import { Badge } from "@/components/ui";
import { Field } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { PaperSymbols } from "@/components/PaperSymbols";
import { AgendaItemVoting } from "@/components/AgendaItemVoting";
import { AgendaNoteEditor } from "@/components/AgendaNoteEditor";
import { useToast } from "@/components/Toast";
import { AGENDA_CLASSIFICATIONS, AGENDA_CLASSIFICATION_LABELS, DOC_CLASSIFICATIONS, MAJORITY_RULES, type AgendaClassification } from "@/lib/enums";
import { addAgendaItem, updateAgendaItem, removeAgendaItem, saveDiscussionNote, reorderAgenda } from "./actions";

type Doc = { id: number; version: number; mimeType: string; fileName: string; classification: string; _count: { annotations: number } };
export type AgendaItemData = {
  id: number;
  parentId: number | null;
  title: string;
  description: string | null;
  classification: string;
  isSupplementary: boolean;
  discussionNote: string | null;
  note?: string | null;
  presenterId: number | null;
  majorityRule: string;
  votingStatus: string;
  presenter: { name: string } | null;
  proposedBy: { name: string } | null;
  documents: Doc[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  votes: any[];
  _count: { documents: number };
  children?: AgendaItemData[];
};

export function AgendaList(props: {
  meetingId: number;
  items: AgendaItemData[];
  people: { id: number; name: string }[];
  userId: number;
  userName: string;
  totalVoters: number;
  canDraft: boolean;
  canRecord: boolean;
  inMeeting: boolean;
  locked: boolean;
  canVote: boolean;
  canManageVote: boolean;
}) {
  const { meetingId, items, people, userId, userName, totalVoters, canDraft, canRecord, inMeeting, locked, canVote, canManageVote } = props;
  const toast = useToast();
  const byId = new Map(items.map((i) => [i.id, i]));
  const [order, setOrder] = useState<number[]>(items.map((i) => i.id));
  const [dragId, setDragId] = useState<number | null>(null);
  const orderRef = useRef(order);
  orderRef.current = order;
  const savedRef = useRef(order.join(","));

  const itemsSerialized = items.map((i) => i.id).join(",");
  useEffect(() => {
    setOrder(items.map((i) => i.id));
  }, [itemsSerialized]);
  const rowRefs = useRef<Map<number, HTMLLIElement | null>>(new Map());
  const dragRef = useRef<{ id: number } | null>(null);

  const draggable = canDraft && !locked;

  // Listen on window during the drag (not pointer-capture on the handle, which
  // the browser releases when the row moves in the DOM during reorder).
  const onMove = useCallback((e: globalThis.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const y = e.clientY;
    let targetId: number | null = null;
    for (const [id, el] of rowRefs.current) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (y >= r.top && y <= r.bottom) { targetId = id; break; }
    }
    if (targetId != null && targetId !== d.id) {
      setOrder((prev) => {
        const from = prev.indexOf(d.id);
        const to = prev.indexOf(targetId!);
        if (from < 0 || to < 0) return prev;
        const next = [...prev];
        next.splice(from, 1);
        next.splice(to, 0, d.id);
        return next;
      });
    }
  }, []);

  const onUp = useCallback(async () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    const d = dragRef.current;
    dragRef.current = null;
    setDragId(null);
    if (!d) return;
    const current = orderRef.current.join(",");
    if (current !== savedRef.current) {
      savedRef.current = current;
      const res = await reorderAgenda(meetingId, orderRef.current);
      if (res?.error) toast({ type: "error", message: res.error });
      else toast({ type: "success", message: "Agenda reordered" });
    }
  }, [onMove, meetingId, toast]);

  const onDown = (e: ReactPointerEvent, id: number) => {
    if (!draggable) return;
    e.preventDefault();
    dragRef.current = { id };
    setDragId(id);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  useEffect(() => () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  }, [onMove, onUp]);

  return (
    <ol className={cn("mb-6 space-y-3", dragId != null && "touch-none select-none")}>
      {order.map((id, idx) => {
        const item = byId.get(id);
        if (!item) return null;
        return (
          <li key={id} ref={(el) => { rowRefs.current.set(id, el); }} className={cn("card p-4 transition-shadow", dragId === id && "opacity-70 ring-2 ring-gold-300")}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{idx + 1}</span>
                  <span className="font-medium text-slate-800">{item.title}</span>
                  <Badge tone="blue">{AGENDA_CLASSIFICATION_LABELS[item.classification as AgendaClassification] ?? item.classification}</Badge>
                  {item.isSupplementary ? <Badge tone="amber">Supplementary</Badge> : null}
                  {item._count.documents > 0 ? <Badge tone="gray">{item._count.documents} doc</Badge> : null}
                </div>
                {item.description ? <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-600">{item.description}</p> : null}
                <p className="mt-1 text-xs text-slate-400">
                  {item.presenter ? `Presenter: ${item.presenter.name}` : "No presenter"}
                  {item.proposedBy ? ` · Proposed by ${item.proposedBy.name}` : ""}
                </p>
                {item.documents.length > 0 ? (
                  <div className="mt-2 space-y-1">
                    {item.documents.map((d) => (
                      <div key={d.id} className="flex flex-wrap items-center gap-2">
                        <a href={`/documents/${d.id}/annotate`} className="text-xs font-medium text-brand-600 hover:underline">{d.fileName}</a>
                        <PaperSymbols mimeType={d.mimeType} fileName={d.fileName} classification={d.classification} version={d.version} comments={d._count.annotations} />
                      </div>
                    ))}
                  </div>
                ) : null}
                <AgendaNoteEditor itemId={item.id} initialNote={item.note} />
              </div>
              {draggable ? (
                <button
                  type="button"
                  onPointerDown={(e) => onDown(e, id)}
                  title="Drag to reorder"
                  aria-label="Drag to reorder"
                  className="flex shrink-0 cursor-grab touch-none items-center justify-center rounded-lg border border-cream-300 bg-cream-50 px-2 py-1.5 text-slate-400 hover:bg-cream-100 hover:text-slate-700 active:cursor-grabbing"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" /><circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" /><circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" /></svg>
                </button>
              ) : null}
            </div>

            {/* Minutes of Meeting */}
            {(canDraft || canRecord) ? (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <ActionForm action={saveDiscussionNote} submitLabel="Save Minutes" submitVariant="secondary" className="!space-y-0">
                  <input type="hidden" name="meetingId" value={meetingId} />
                  <input type="hidden" name="itemId" value={item.id} />
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Minutes of Meeting</label>
                  <div className="flex gap-2">
                    <textarea
                      name="discussionNote"
                      rows={2}
                      className="input text-xs flex-1"
                      placeholder="Record minutes / discussion notes for this item..."
                      defaultValue={item.discussionNote || ""}
                    />
                    <button type="submit" className="btn-secondary btn-sm shrink-0 self-end">Save</button>
                  </div>
                </ActionForm>
              </div>
            ) : item.discussionNote ? (
              <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Minutes of Meeting</p>
                {item.discussionNote}
              </div>
            ) : null}

            {item.classification === "ForApproval" ? (
              <AgendaItemVoting
                meetingId={meetingId}
                itemId={item.id}
                initialVotes={item.votes}
                userId={userId}
                userName={userName}
                majorityRule={item.majorityRule}
                initialVotingStatus={item.votingStatus}
                totalVoters={totalVoters}
                canVote={canVote}
                canManageVote={canManageVote}
              />
            ) : null}

            {/* Sub-agenda items */}
            {(item.children && item.children.length > 0) || (canDraft && (!locked || item.isSupplementary)) ? (
              <div className="mt-3 border-l-2 border-cream-300 pl-4">
                {item.children && item.children.length > 0 ? (
                  <ul className="space-y-2">
                    {item.children.map((child, ci) => (
                      <SubItem
                        key={child.id}
                        child={child}
                        label={`${idx + 1}.${ci + 1}`}
                        meetingId={meetingId}
                        people={people}
                        userId={userId}
                        userName={userName}
                        totalVoters={totalVoters}
                        canDraft={canDraft}
                        canRecord={canRecord}
                        locked={locked}
                        canVote={canVote}
                        canManageVote={canManageVote}
                      />
                    ))}
                  </ul>
                ) : null}

                {canDraft && (!locked || item.isSupplementary) ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-medium text-brand-600">+ Add sub-item</summary>
                    <ActionForm action={addAgendaItem} submitLabel="Add sub-item" submitVariant="secondary" className="mt-2" successToast="Sub-item added">
                      <input type="hidden" name="meetingId" value={meetingId} />
                      <input type="hidden" name="parentId" value={item.id} />
                      <Field label="Title" required><input name="title" className="input" required placeholder="e.g. Sub-point under this item" /></Field>
                      <Field label="Description"><textarea name="description" className="input" rows={2} /></Field>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Classification">
                          <select name="classification" className="input" defaultValue="ForDiscussion">
                            {AGENDA_CLASSIFICATIONS.map((c) => <option key={c} value={c}>{AGENDA_CLASSIFICATION_LABELS[c]}</option>)}
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
                        <Field label="Board paper (optional)" hint="PDF / Word / Excel / PPT — added to the board pack.">
                          <input type="file" name="file" className="block w-full text-sm" />
                        </Field>
                        <Field label="Paper confidentiality">
                          <select name="docClassification" className="input" defaultValue="Internal">
                            {DOC_CLASSIFICATIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </Field>
                      </div>
                    </ActionForm>
                  </details>
                ) : null}
              </div>
            ) : null}

            {canDraft && (!locked || item.isSupplementary) ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-medium text-slate-500">Edit item</summary>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <ActionForm action={updateAgendaItem} submitLabel="Save" submitVariant="secondary">
                    <input type="hidden" name="meetingId" value={meetingId} />
                    <input type="hidden" name="itemId" value={item.id} />
                    <Field label="Title"><input name="title" className="input" defaultValue={item.title} /></Field>
                    <Field label="Description"><textarea name="description" className="input" rows={2} defaultValue={item.description ?? ""} /></Field>
                    <Field label="Classification">
                      <select name="classification" className="input" defaultValue={item.classification}>
                        {AGENDA_CLASSIFICATIONS.map((c) => <option key={c} value={c}>{AGENDA_CLASSIFICATION_LABELS[c]}</option>)}
                      </select>
                    </Field>
                    <Field label="Majority" hint={item.votingStatus === "None" ? "If put to a vote" : "Locked once circulated"}>
                      <select name="majorityRule" className="input" defaultValue={item.majorityRule} disabled={item.votingStatus !== "None"}>
                        {MAJORITY_RULES.map((m) => <option key={m} value={m}>{m === "Special" ? "Special (≥75%)" : "Simple"}</option>)}
                      </select>
                    </Field>
                    <Field label="Presenter">
                      <select name="presenterId" className="input" defaultValue={item.presenterId ?? ""}>
                        <option value="">None</option>
                        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Add board paper" hint="PDF / Word / Excel / PPT — added to the board pack.">
                      <input type="file" name="file" className="block w-full text-sm" />
                    </Field>
                    <Field label="Paper confidentiality">
                      <select name="docClassification" className="input" defaultValue="Internal">
                        {DOC_CLASSIFICATIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </Field>
                  </ActionForm>
                  <ActionForm action={removeAgendaItem} successToast="Item removed">
                    <input type="hidden" name="meetingId" value={meetingId} />
                    <input type="hidden" name="itemId" value={item.id} />
                    <ConfirmSubmit>Remove item</ConfirmSubmit>
                  </ActionForm>
                </div>
              </details>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function SubItem(props: {
  child: AgendaItemData;
  label: string;
  meetingId: number;
  people: { id: number; name: string }[];
  userId: number;
  userName: string;
  totalVoters: number;
  canDraft: boolean;
  canRecord: boolean;
  locked: boolean;
  canVote: boolean;
  canManageVote: boolean;
}) {
  const { child, label, meetingId, people, userId, userName, totalVoters, canDraft, canRecord, locked, canVote, canManageVote } = props;
  return (
    <li className="rounded-lg border border-cream-300 bg-cream-50/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600">{label}</span>
        <span className="text-sm font-medium text-slate-800">{child.title}</span>
        <Badge tone="blue">{AGENDA_CLASSIFICATION_LABELS[child.classification as AgendaClassification] ?? child.classification}</Badge>
        {child.isSupplementary ? <Badge tone="amber">Supplementary</Badge> : null}
      </div>
      {child.description ? <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{child.description}</p> : null}
      {child.presenter ? <p className="mt-1 text-xs text-slate-400">Presenter: {child.presenter.name}</p> : null}
      {child.documents.length > 0 ? (
        <div className="mt-2 space-y-1">
          {child.documents.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center gap-2">
              <a href={`/documents/${d.id}/annotate`} className="text-xs font-medium text-brand-600 hover:underline">{d.fileName}</a>
              <PaperSymbols mimeType={d.mimeType} fileName={d.fileName} classification={d.classification} version={d.version} comments={d._count.annotations} />
            </div>
          ))}
        </div>
      ) : null}

      <AgendaNoteEditor itemId={child.id} initialNote={child.note} />

      {child.classification === "ForApproval" ? (
        <AgendaItemVoting
          meetingId={meetingId}
          itemId={child.id}
          initialVotes={child.votes}
          userId={userId}
          userName={userName}
          majorityRule={child.majorityRule}
          initialVotingStatus={child.votingStatus}
          totalVoters={totalVoters}
          canVote={canVote}
          canManageVote={canManageVote}
        />
      ) : null}

      {/* Minutes of Meeting */}
      {(canDraft || canRecord) ? (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <ActionForm action={saveDiscussionNote} submitLabel="Save Minutes" submitVariant="secondary" className="!space-y-0">
            <input type="hidden" name="meetingId" value={meetingId} />
            <input type="hidden" name="itemId" value={child.id} />
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Minutes of Meeting</label>
            <div className="flex gap-2">
              <textarea
                name="discussionNote"
                rows={2}
                className="input text-xs flex-1"
                placeholder="Record minutes / discussion notes for this sub-item..."
                defaultValue={child.discussionNote || ""}
              />
              <button type="submit" className="btn-secondary btn-sm shrink-0 self-end">Save</button>
            </div>
          </ActionForm>
        </div>
      ) : child.discussionNote ? (
        <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Minutes of Meeting</p>
          {child.discussionNote}
        </div>
      ) : null}

      {canDraft && (!locked || child.isSupplementary) ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-medium text-slate-500">Edit sub-item</summary>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <ActionForm action={updateAgendaItem} submitLabel="Save" submitVariant="secondary">
              <input type="hidden" name="meetingId" value={meetingId} />
              <input type="hidden" name="itemId" value={child.id} />
              <Field label="Title"><input name="title" className="input" defaultValue={child.title} /></Field>
              <Field label="Description"><textarea name="description" className="input" rows={2} defaultValue={child.description ?? ""} /></Field>
              <Field label="Classification">
                <select name="classification" className="input" defaultValue={child.classification}>
                  {AGENDA_CLASSIFICATIONS.map((c) => <option key={c} value={c}>{AGENDA_CLASSIFICATION_LABELS[c]}</option>)}
                </select>
              </Field>
              <Field label="Presenter">
                <select name="presenterId" className="input" defaultValue={child.presenterId ?? ""}>
                  <option value="">None</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              <Field label="Add board paper" hint="PDF / Word / Excel / PPT — added to the board pack.">
                <input type="file" name="file" className="block w-full text-sm" />
              </Field>
              <Field label="Paper confidentiality">
                <select name="docClassification" className="input" defaultValue="Internal">
                  {DOC_CLASSIFICATIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
            </ActionForm>
            <ActionForm action={removeAgendaItem} successToast="Sub-item removed">
              <input type="hidden" name="meetingId" value={meetingId} />
              <input type="hidden" name="itemId" value={child.id} />
              <ConfirmSubmit>Remove sub-item</ConfirmSubmit>
            </ActionForm>
          </div>
        </details>
      ) : null}
    </li>
  );
}
