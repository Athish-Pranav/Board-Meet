import Link from "next/link";
import { Card } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { startSession } from "@/app/(app)/meetings/actions";
import { RoomTabs, type AgendaNode, type PackLite, type VotingLite } from "@/components/call/RoomTabs";

export type { AgendaNode };

/**
 * Unified meeting-room companion — agenda, board pack and resolution voting,
 * shared by Physical and Video/Hybrid meetings.
 *
 * The call itself is never embedded on this page — it's Zoom's real Client
 * View, a full-page experience at /call/[id]. That route lives outside the
 * (app) route group entirely, so none of its fixed-position chrome (chat
 * widget, notifiers) sits over Zoom's own injected UI and eats clicks.
 * "Join Meeting" is a page transition there and back, not a box embedded
 * here — Component View (a box you size yourself) had a floating,
 * self-managed toolbar and video window that fought every attempt to fit
 * them into a column, plus a real SDK crash, so it was replaced entirely.
 * The call route itself renders the same agenda/voting/pack content in a
 * side-by-side drawer — see CallSidePanel — so it isn't missing here either.
 */
export function MeetingRoom({ meetingId, agenda, pack, joinUrl, meetingTitle, voting, embedCall, canStartSession }: { meetingId: number; agenda: AgendaNode[]; pack: PackLite; joinUrl?: string | null; meetingTitle: string; voting?: VotingLite | null; embedCall?: boolean; canStartSession?: boolean }) {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {canStartSession ? (
        <Card className="border-gold-300 bg-gold-50/60">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gold-700">Not yet started</p>
              <p className="font-medium text-slate-800">Joining the call doesn&apos;t notify anyone — start the meeting to alert every director.</p>
            </div>
            <ActionForm action={startSession} submitLabel="Start meeting for everyone" successToast={null} className="shrink-0">
              <input type="hidden" name="id" value={meetingId} />
            </ActionForm>
          </div>
        </Card>
      ) : null}

      {embedCall ? (
        <Card className="border-emerald-200 bg-emerald-50/60">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Video meeting</p>
              <p className="font-medium text-slate-800">{meetingTitle} happens in Zoom.</p>
            </div>
            {/* New tab, deliberately: this room page (agenda/board pack/voting)
                stays open in its own tab so it's easy to switch to and share
                or reference, rather than the call replacing it here. */}
            <Link href={`/call/${meetingId}`} target="_blank" rel="noopener noreferrer" className="btn-primary shrink-0">Join Meeting ↗</Link>
          </div>
        </Card>
      ) : joinUrl ? (
        <Card className="border-emerald-200 bg-emerald-50/60">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Video meeting</p>
              <p className="font-medium text-slate-800">{meetingTitle} happens in Zoom.</p>
            </div>
            <a href={joinUrl} target="_blank" rel="noopener noreferrer" className="btn-primary shrink-0">Open in Zoom →</a>
          </div>
        </Card>
      ) : null}

      <RoomTabs meetingId={meetingId} agenda={agenda} pack={pack} voting={voting} />
    </div>
  );
}
