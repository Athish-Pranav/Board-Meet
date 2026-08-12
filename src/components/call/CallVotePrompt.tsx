"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/format";
import { VOTE_CHOICES } from "@/lib/enums";
import { castVote } from "@/app/(app)/meetings/[id]/agenda/actions";

type LiveVote = { itemId: number; meetingId: number; title: string; majorityRule: string; myChoice: string | null };

const POLL_OPEN_MS = 2000;
const POLL_IDLE_MS = 20000;

/**
 * Vote-casting prompt for the call page — the director-facing counterpart to
 * CallSidePanel's Voting tab (which only Secretary/CFO get, per the room's
 * existing restriction on who can see the tally/resolution list). Without
 * this, a director inside /call/[id] had no way to vote at all: the app-wide
 * LiveVoteNotifier only lives inside the (app) shell, deliberately excluded
 * from this route to stop it blocking Zoom's own UI.
 *
 * Same data and same restraint as LiveVoteNotifier (cast/change your vote,
 * no visible tally or other directors' choices) but styled as a small
 * non-blocking corner card instead of a full-screen modal — a `fixed
 * inset-0` backdrop here would black out the video every time a vote opened.
 * Not wrapped in ToastProvider (this route has none, on purpose), so
 * feedback is shown inline instead of as a toast.
 */
export function CallVotePrompt({ meetingId }: { meetingId: number }) {
  const [items, setItems] = useState<LiveVote[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<number, string>>({});

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/votes/live", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as { items: LiveVote[] };
      setItems(json.items.filter((i) => i.meetingId === meetingId));
    } catch {
      /* network blip — try again next tick */
    }
  }, [meetingId]);

  const hasOpenVotes = items.length > 0;
  const pollRef = useRef(poll);
  pollRef.current = poll;

  useEffect(() => {
    pollRef.current();
    const iv = setInterval(() => pollRef.current(), hasOpenVotes ? POLL_OPEN_MS : POLL_IDLE_MS);
    return () => clearInterval(iv);
  }, [hasOpenVotes]);

  const vote = useCallback(
    async (item: LiveVote, choice: string) => {
      const prevChoice = item.myChoice;
      setItems((cur) => cur.map((it) => (it.itemId === item.itemId ? { ...it, myChoice: choice } : it)));
      setErrors((e) => ({ ...e, [item.itemId]: "" }));
      setBusy(item.itemId);

      const fd = new FormData();
      fd.set("meetingId", String(item.meetingId));
      fd.set("itemId", String(item.itemId));
      fd.set("choice", choice);

      try {
        const res = await castVote({}, fd);
        setBusy(null);
        if (res?.error) {
          setItems((cur) => cur.map((it) => (it.itemId === item.itemId ? { ...it, myChoice: prevChoice } : it)));
          setErrors((e) => ({ ...e, [item.itemId]: res.error! }));
          return;
        }
        poll();
      } catch {
        setItems((cur) => cur.map((it) => (it.itemId === item.itemId ? { ...it, myChoice: prevChoice } : it)));
        setBusy(null);
        setErrors((e) => ({ ...e, [item.itemId]: "Failed to submit vote." }));
      }
    },
    [poll],
  );

  const visible = items.filter((i) => i.myChoice === null || errors[i.itemId]);
  if (visible.length === 0) return null;

  return (
    <div className="fixed bottom-6 left-6 z-40 flex w-[22rem] max-w-[calc(100vw-3rem)] flex-col gap-3">
      {visible.map((item) => (
        <div key={item.itemId} className="relative overflow-hidden rounded-2xl border border-gold-300 bg-cream-50 p-4 shadow-pop">
          <div className="h-1 w-full bg-gradient-to-r from-gold-400 via-gold-600 to-gold-400" />
          <div className="mt-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gold-700">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold-500 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-gold-600" />
            </span>
            Voting is live
          </div>
          <p className="mt-2 font-serif text-lg font-bold leading-snug text-brand-900">{item.title}</p>
          <p className="mt-1 text-xs text-slate-500">{item.majorityRule === "Special" ? "Special majority (≥75%)" : "Simple majority"}</p>

          {item.myChoice ? (
            <p className="mb-2 mt-3 text-sm text-slate-600">
              Your vote: <span className="rounded-md border border-brand-100 bg-brand-50 px-2 py-0.5 font-bold text-brand-800">{item.myChoice}</span> — tap to change:
            </p>
          ) : (
            <p className="mb-2 mt-3 text-sm font-medium text-slate-700">Cast your vote:</p>
          )}
          <div className="flex gap-2">
            {VOTE_CHOICES.map((c) => {
              const active = item.myChoice === c;
              return (
                <button
                  key={c}
                  disabled={busy === item.itemId}
                  onClick={() => vote(item, c)}
                  className={cn(
                    "flex-1 rounded-lg py-2 text-sm font-bold transition disabled:opacity-50",
                    c === "For" && (active ? "bg-emerald-600 text-white" : "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"),
                    c === "Against" && (active ? "bg-red-600 text-white" : "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"),
                    c === "Abstain" && (active ? "bg-slate-600 text-white" : "border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200"),
                  )}
                >
                  {c}
                </button>
              );
            })}
          </div>
          {errors[item.itemId] ? <p className="mt-2 text-xs text-red-600">{errors[item.itemId]}</p> : null}
        </div>
      ))}
    </div>
  );
}
