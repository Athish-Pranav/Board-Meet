"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui";
import { Icon } from "@/components/icons";
import { AgendaItemVoting } from "@/components/AgendaItemVoting";
import { AgendaNoteEditor } from "@/components/AgendaNoteEditor";
import { PersonalDocDrawer } from "@/components/PersonalDocDrawer";
import { PackCard } from "./PackCard";
import { cn } from "@/lib/format";
import { AGENDA_CLASSIFICATION_LABELS, type AgendaClassification } from "@/lib/enums";

type PaperLite = { id: number; fileName: string; mimeType: string; classification: string };
export type AgendaNode = {
  id: number;
  title: string;
  description: string | null;
  classification: string;
  presenter: { name: string } | null;
  documents: PaperLite[];
  // Private to the current user — never another attendee's notes.
  note?: string | null;
  children?: AgendaNode[];
};
export type PackLite = { id: number; version: number; status: string; ready: boolean } | null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ResolutionLite = { id: number; title: string; majorityRule: string; votingStatus: string; votes: any[] };
export type VotingLite = { userId: number; userName: string; totalVoters: number; canVote: boolean; canManageVote: boolean; resolutions: ResolutionLite[] };

// Solid, high-contrast colors rather than the app's usual pastel Badge
// (bg-emerald-50 + dark text) — that combo washed out to near-illegible
// specifically inside the Zoom call page, most likely Zoom's own injected
// styles bleeding onto the shared document. Scoped to just this agenda tag
// rather than changing the shared Badge component used correctly elsewhere.
const CLASSIFICATION_STYLES: Record<string, string> = {
  ForApproval: "bg-amber-600 text-white",
  ForInformation: "bg-brand-700 text-white",
  ForDiscussion: "bg-emerald-600 text-white",
};

function ClassificationTag({ classification }: { classification: string }) {
  const cls = CLASSIFICATION_STYLES[classification] ?? "bg-slate-600 text-white";
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", cls)}>
      {AGENDA_CLASSIFICATION_LABELS[classification as AgendaClassification] ?? classification}
    </span>
  );
}

function PaperLink({ d }: { d: PaperLite }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-cream-300 bg-white px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:border-gold-300 hover:bg-cream-50"
      >
        <Icon name="document" className="h-4 w-4 shrink-0 text-slate-400" />
        <span className="truncate">{d.fileName}</span>
        {d.classification === "Confidential" ? <span className="shrink-0 rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-semibold text-rose-700">Confidential</span> : null}
      </button>
      {open ? (
        // Opens as an overlay rather than navigating to /documents/[id]/view —
        // on the call page, a page navigation would unmount ZoomClientView and
        // drop the live call just to view a paper. Includes private
        // drawing/highlighting — each person's own markup, saved for later.
        <PersonalDocDrawer documentId={d.id} fileName={d.fileName} mimeType={d.mimeType} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function AgendaEntry({ node, label }: { node: AgendaNode; label: string }) {
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-brand-100 px-1.5 text-xs font-semibold text-brand-800">{label}</span>
        <span className="font-medium text-slate-800">{node.title}</span>
        <ClassificationTag classification={node.classification} />
      </div>
      {node.description ? <p className="mt-1.5 whitespace-pre-wrap pl-8 text-sm text-slate-600">{node.description}</p> : null}
      <p className="mt-1 pl-8 text-xs text-slate-400">{node.presenter ? `Presenter: ${node.presenter.name}` : "No presenter"}</p>
      {node.documents.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2 pl-8">
          {node.documents.map((d) => <PaperLink key={d.id} d={d} />)}
        </div>
      ) : null}
      <div className="pl-8">
        <AgendaNoteEditor itemId={node.id} initialNote={node.note} />
      </div>
      {node.children && node.children.length > 0 ? (
        <ul className="mt-2 border-l-2 border-cream-300 pl-4">
          {node.children.map((c, i) => <AgendaEntry key={c.id} node={c} label={`${label}.${i + 1}`} />)}
        </ul>
      ) : null}
    </li>
  );
}

function AgendaCard({ agenda }: { agenda: AgendaNode[] }) {
  return (
    <Card>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="section-title">Agenda</h2>
        <span className="text-xs text-slate-400">{agenda.length} item{agenda.length === 1 ? "" : "s"}</span>
      </div>
      <p className="mb-2 text-sm text-slate-500">Follow the running order below. Tap any paper to open it.</p>
      {agenda.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">No agenda items yet.</p>
      ) : (
        <ul className="divide-y divide-cream-200">
          {agenda.map((node, i) => <AgendaEntry key={node.id} node={node} label={`${i + 1}`} />)}
        </ul>
      )}
    </Card>
  );
}

function VotingCard({ meetingId, voting }: { meetingId: number; voting: VotingLite }) {
  return (
    <Card>
      <h2 className="section-title mb-3">Resolutions &amp; voting</h2>
      <div className="space-y-3">
        {voting.resolutions.map((r) => (
          <div key={r.id} className="rounded-xl border border-cream-200 p-1">
            <p className="px-2 pt-1.5 text-sm font-semibold text-brand-900">{r.title}</p>
            <AgendaItemVoting
              meetingId={meetingId}
              itemId={r.id}
              initialVotes={r.votes}
              userId={voting.userId}
              userName={voting.userName}
              majorityRule={r.majorityRule}
              initialVotingStatus={r.votingStatus}
              totalVoters={voting.totalVoters}
              canVote={voting.canVote}
              canManageVote={voting.canManageVote}
              alwaysPoll
            />
          </div>
        ))}
      </div>
    </Card>
  );
}

type TabKey = "contents" | "agenda" | "voting" | "pack";

function flattenAgenda(nodes: AgendaNode[]): AgendaNode[] {
  return nodes.flatMap((n) => [n, ...(n.children ? flattenAgenda(n.children) : [])]);
}

/**
 * Quick-jump overview — a scannable index of what's in the meeting, distinct
 * from the Agenda tab's full detail (descriptions, presenters, documents).
 * The natural landing tab when nothing is actively open for voting.
 */
function ContentsCard({ agenda, pack, voting, onJump }: { agenda: AgendaNode[]; pack: PackLite; voting?: VotingLite | null; onJump: (tab: TabKey) => void }) {
  const flat = flattenAgenda(agenda);
  const hasVoting = Boolean(voting && voting.resolutions.length > 0);
  const openCount = voting?.resolutions.filter((r) => r.votingStatus === "Circulated").length ?? 0;

  return (
    <Card>
      <h2 className="section-title mb-3">Contents</h2>
      <div className="space-y-4">
        <div>
          <button type="button" onClick={() => onJump("agenda")} className="mb-1 flex w-full items-center justify-between text-left text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-brand-700">
            Agenda <span>{agenda.length} item{agenda.length === 1 ? "" : "s"} →</span>
          </button>
          {flat.length === 0 ? (
            <p className="py-2 text-sm text-slate-400">No agenda items yet.</p>
          ) : (
            <ul className="divide-y divide-cream-200">
              {flat.map((node, i) => (
                <li key={node.id}>
                  <button type="button" onClick={() => onJump("agenda")} className="flex w-full items-center gap-2 py-2 text-left text-sm text-slate-700 hover:text-brand-700">
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-100 px-1 text-[11px] font-semibold text-brand-800">{i + 1}</span>
                    <span className="truncate">{node.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {hasVoting ? (
          <button type="button" onClick={() => onJump("voting")} className="flex w-full items-center justify-between rounded-lg border border-cream-200 px-3 py-2 text-left text-sm hover:border-gold-300 hover:bg-cream-50">
            <span className="font-medium text-slate-700">Resolutions &amp; voting</span>
            <span className="text-xs text-slate-500">{openCount > 0 ? `${openCount} open` : `${voting!.resolutions.length} total`} →</span>
          </button>
        ) : null}

        <button type="button" onClick={() => onJump("pack")} className="flex w-full items-center justify-between rounded-lg border border-cream-200 px-3 py-2 text-left text-sm hover:border-gold-300 hover:bg-cream-50">
          <span className="font-medium text-slate-700">Board pack</span>
          <span className="text-xs text-slate-500">{pack ? `v${pack.version} →` : "Not compiled →"}</span>
        </button>
      </div>
    </Card>
  );
}

/**
 * Contents / Agenda / Voting / Board pack as tabs instead of stacked cards —
 * quicker to scan than several full cards one after another, and lets
 * Contents act as a one-screen index into the rest.
 *
 * Shared between the meeting room page and the in-call side panel (see
 * src/components/call/CallSidePanel.tsx) — one implementation, so a fix or
 * change in one place can't drift out of sync with the other.
 */
export function RoomTabs({
  meetingId,
  agenda,
  pack,
  voting,
  focusVotingSignal,
}: {
  meetingId: number;
  agenda: AgendaNode[];
  pack: PackLite;
  voting?: VotingLite | null;
  // Bumped by a parent (CallSidePanel) when a resolution newly opens for
  // voting, to jump here even if the user is looking at another tab. An
  // event/counter rather than a controlled "activeTab" prop — this component
  // still owns its own tab state day-to-day, this is just an interrupt.
  focusVotingSignal?: number;
}) {
  const hasVoting = Boolean(voting && voting.resolutions.length > 0);
  // Default to Voting when a resolution is already open — that's the thing
  // someone opening the room mid-meeting most likely needs first. Otherwise
  // land on Contents, the overview.
  const initialTab: TabKey = hasVoting && voting!.resolutions.some((r) => r.votingStatus === "Circulated") ? "voting" : "contents";
  const [tab, setTab] = useState<TabKey>(initialTab);

  useEffect(() => {
    if (focusVotingSignal) setTab("voting");
  }, [focusVotingSignal]);

  const tabs: { key: TabKey; label: string; count: number | null }[] = [
    { key: "contents", label: "Contents", count: null },
    { key: "agenda", label: "Agenda", count: agenda.length },
    ...(hasVoting ? [{ key: "voting" as const, label: "Voting", count: voting!.resolutions.length }] : []),
    { key: "pack", label: "Board pack", count: null },
  ];
  // If the active tab disappears (e.g. the last resolution closes), fall back
  // rather than render nothing.
  const active = tabs.some((t) => t.key === tab) ? tab : "contents";

  return (
    <div>
      <div className="mb-3 flex gap-1 rounded-xl border border-cream-300 bg-white p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "flex-1 rounded-lg px-2 py-2 text-sm font-medium transition",
              active === t.key ? "bg-brand-600 text-cream-50" : "text-slate-600 hover:bg-cream-100",
            )}
          >
            {t.label}
            {t.count !== null ? ` (${t.count})` : ""}
          </button>
        ))}
      </div>
      {active === "contents" ? <ContentsCard agenda={agenda} pack={pack} voting={voting} onJump={setTab} /> : null}
      {active === "agenda" ? <AgendaCard agenda={agenda} /> : null}
      {active === "voting" && voting ? <VotingCard meetingId={meetingId} voting={voting} /> : null}
      {active === "pack" ? <PackCard pack={pack} canClearAnnotations={Boolean(voting?.canManageVote)} /> : null}
    </div>
  );
}
