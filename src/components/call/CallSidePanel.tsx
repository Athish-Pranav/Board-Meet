"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RoomTabs, type AgendaNode, type PackLite, type VotingLite } from "./RoomTabs";
import { cn } from "@/lib/format";

type LiveVoteItem = { itemId: number; meetingId: number };

const POLL_MS = 3000;

/**
 * Agenda / Voting / Board pack, as a collapsible drawer over the Zoom Client
 * View call page — the "side by side" view: the video stays visible on the
 * left, papers slide in from the right on demand.
 *
 * Also the "voting started" prompt for inside the call: polls the same
 * /api/votes/live endpoint the app-wide LiveVoteNotifier uses (filtered to
 * this meeting), and when a resolution newly opens for voting, auto-opens
 * the panel and jumps it to the Voting tab. The collapsed toggle tab also
 * shows a pulsing dot whenever a vote is open, so it stays visible even if
 * someone closes the panel again mid-vote. LiveVoteNotifier itself is NOT
 * reused here on purpose — it's a full-screen blocking modal, which would
 * cover the video entirely every time a vote opened.
 *
 * Zoom's Client View injects its own full-page UI directly into this page
 * (see ZoomClientView's doc comment) and isn't rendered inside a container we
 * control, so this panel can't be laid out in a normal flex/grid column next
 * to it — it has to float above it instead. Two things keep that safe rather
 * than repeating the earlier bug where unrelated fixed-position app chrome
 * silently ate clicks meant for Zoom:
 *   1. This is the ONLY overlay on this page (the call route lives outside
 *      the (app) shell specifically so nothing else competes for z-index).
 *   2. When collapsed, the panel is translated fully off-screen rather than
 *      just hidden/faded, so it has zero hit-testable area over the video —
 *      only the toggle tab itself is ever clickable.
 * The z-index is a moderate 40, not the max possible: Zoom's own dialogs
 * (leave-meeting confirmation, settings) should still be able to sit above
 * it if needed. That's unverified — I can't see Zoom's own stacking order —
 * so it's the one thing worth checking first if a Zoom dialog ever seems to
 * render "behind" this panel.
 */
export function CallSidePanel({ meetingId, agenda, pack, voting }: { meetingId: number; agenda: AgendaNode[]; pack: PackLite; voting?: VotingLite | null }) {
  const [open, setOpen] = useState(false);
  const [hasLiveVote, setHasLiveVote] = useState(false);
  const [focusVotingSignal, setFocusVotingSignal] = useState(0);
  const seen = useRef<Set<number>>(new Set());

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/votes/live", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { items: LiveVoteItem[] };
      const mine = data.items.filter((i) => i.meetingId === meetingId);
      setHasLiveVote(mine.length > 0);

      // `seen` starts empty, so a vote already open when this page is first
      // reached counts as "new" too — someone joining a call mid-vote
      // shouldn't have to go looking for it themselves.
      const isNew = mine.some((i) => !seen.current.has(i.itemId));
      if (isNew) {
        setOpen(true);
        setFocusVotingSignal((n) => n + 1);
      }
      seen.current = new Set(mine.map((i) => i.itemId));
    } catch {
      /* network blip — try again next tick */
    }
  }, [meetingId]);

  useEffect(() => {
    poll();
    const iv = setInterval(poll, POLL_MS);
    return () => clearInterval(iv);
  }, [poll]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close papers panel" : "Open agenda, voting and board pack"}
        className={cn(
          "fixed top-1/2 z-40 -translate-y-1/2 rounded-l-xl border border-r-0 border-cream-300 bg-white px-2 py-4 text-xs font-semibold text-brand-700 shadow-pop transition-[right] duration-200",
          open ? "right-[38rem]" : "right-0",
        )}
      >
        {hasLiveVote && !open ? (
          <span className="absolute -left-1 top-2 flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold-500 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-gold-600" />
          </span>
        ) : null}
        <span className="block [writing-mode:vertical-rl]">{open ? "Close ▸" : "◂ Papers"}</span>
      </button>

      <div
        className={cn(
          "fixed inset-y-0 right-0 z-40 w-[38rem] max-w-[90vw] overflow-y-auto border-l border-cream-300 bg-cream-50 p-4 shadow-pop transition-transform duration-200",
          open ? "translate-x-0" : "translate-x-full",
        )}
        // Collapsed, this element still occupies layout space off-screen —
        // translate-x-full moves it there, but belt-and-braces: no pointer
        // events at all while closed, so it can never intercept a click even
        // during the slide transition.
        style={{ pointerEvents: open ? "auto" : "none" }}
      >
        <RoomTabs meetingId={meetingId} agenda={agenda} pack={pack} voting={voting} focusVotingSignal={focusVotingSignal} />
      </div>
    </>
  );
}
