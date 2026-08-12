"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/format";
import { useToast } from "./Toast";
import { VOTE_CHOICES } from "@/lib/enums";
import { castVote } from "@/app/(app)/meetings/[id]/agenda/actions";

type LiveVote = {
  itemId: number;
  meetingId: number;
  title: string;
  meetingTitle: string;
  majorityRule: string;
  myChoice: string | null;
};
type LiveData = { canVote: boolean; items: LiveVote[] };

const POLL_OPEN_MS = 2000; // fast poll while a vote is open, for live tallies
const POLL_IDLE_MS = 30000; // slow heartbeat while nothing is open, just to detect a new vote starting

/**
 * Live-voting popup. Polls for "For Approval" agenda items that are currently
 * open for voting and surfaces them as small cards in the corner — with the
 * vote buttons inline so directors can vote on the spot, from any page.
 */
export function LiveVoteNotifier() {
  const toast = useToast();
  const [data, setData] = useState<LiveData>({ canVote: false, items: [] });
  const [busy, setBusy] = useState<number | null>(null);
  const seen = useRef<Set<number>>(new Set());
  const firstLoad = useRef(true);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/votes/live", { cache: "no-store" });
      if (!res.ok) return;
      const json: LiveData = await res.json();
      // Announce votes that have just opened (skip the initial load).
      if (!firstLoad.current) {
        for (const it of json.items) {
          if (!seen.current.has(it.itemId)) {
            toast({ type: "info", message: `🗳 Voting is live: ${it.title}` });
          }
        }
      }
      seen.current = new Set(json.items.map((i) => i.itemId));
      firstLoad.current = false;
      setData(json);
    } catch {
      /* network blip — try again next tick */
    }
  }, [toast]);

  const hasOpenVotes = data.items.length > 0;

  useEffect(() => {
    poll();
    const onWake = () => { if (document.visibilityState === "visible") poll(); };
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, [poll]);

  // Poll fast (every 2s) while a vote is open for live tallies; otherwise fall
  // back to a slow heartbeat that just checks whether a new vote has started.
  useEffect(() => {
    const iv = setInterval(poll, hasOpenVotes ? POLL_OPEN_MS : POLL_IDLE_MS);
    return () => clearInterval(iv);
  }, [poll, hasOpenVotes]);

  const vote = useCallback(
    async (item: LiveVote, choice: string) => {
      const prevChoice = item.myChoice;
      // Optimistic update
      setData((d) => ({
        ...d,
        items: d.items.map((it) => (it.itemId === item.itemId ? { ...it, myChoice: choice } : it)),
      }));
      setBusy(item.itemId);

      const fd = new FormData();
      fd.set("meetingId", String(item.meetingId));
      fd.set("itemId", String(item.itemId));
      fd.set("choice", choice);

      try {
        const res = await castVote({}, fd);
        setBusy(null);
        if (res?.error) {
          // Revert on error
          setData((d) => ({
            ...d,
            items: d.items.map((it) => (it.itemId === item.itemId ? { ...it, myChoice: prevChoice } : it)),
          }));
          toast({ type: "error", message: res.error });
          return;
        }
        toast({ type: "success", message: `Voted ${choice}` });
        poll();
      } catch {
        // Revert on error
        setData((d) => ({
          ...d,
          items: d.items.map((it) => (it.itemId === item.itemId ? { ...it, myChoice: prevChoice } : it)),
        }));
        setBusy(null);
        toast({ type: "error", message: "Failed to submit vote." });
      }
    },
    [poll, toast],
  );

  const visible = data.items.filter((i) => i.myChoice === null);
  if (visible.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="flex w-full max-w-lg flex-col gap-4">
        {visible.map((item) => (
          <div
            key={item.itemId}
            className="relative overflow-hidden rounded-2xl border border-gold-300 bg-cream-50 p-6 shadow-pop animate-in zoom-in-95 duration-300 pointer-events-auto"
          >
            {/* Top border decoration line */}
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-gold-400 via-gold-600 to-gold-400" />
            
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gold-700">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold-500 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-gold-600" />
                </span>
                Voting is live
              </span>
            </div>

            <div className="mt-3">
              <Link href={`/meetings/${item.meetingId}/agenda`} className="block font-serif text-xl font-bold text-brand-900 hover:text-brand-700 leading-snug">
                {item.title}
              </Link>
              <p className="mt-1 text-sm text-slate-500">
                {item.meetingTitle} · <span className="font-medium text-slate-700">{item.majorityRule === "Special" ? "Special majority (≥75%)" : "Simple majority"}</span>
              </p>
            </div>

            {data.canVote ? (
              <div className="mt-5">
                {item.myChoice ? (
                  <p className="mb-3 text-sm text-slate-600">
                    Your current vote: <span className="font-bold text-brand-800 bg-brand-50 border border-brand-100 px-2 py-0.5 rounded-md">{item.myChoice}</span> — tap to change:
                  </p>
                ) : (
                  <p className="mb-3 text-sm font-medium text-slate-700">Cast your vote on the spot:</p>
                )}
                <div className="flex gap-3">
                  {VOTE_CHOICES.map((c) => {
                    const active = item.myChoice === c;
                    return (
                      <button
                        key={c}
                        disabled={busy === item.itemId}
                        onClick={() => vote(item, c)}
                        className={cn(
                          "flex-1 rounded-xl py-3 text-sm font-bold transition-all duration-200 active:scale-95 disabled:opacity-50 shadow-sm",
                          c === "For" && (active ? "bg-emerald-600 text-white ring-2 ring-emerald-600 ring-offset-2" : "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"),
                          c === "Against" && (active ? "bg-red-600 text-white ring-2 ring-red-600 ring-offset-2" : "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"),
                          c === "Abstain" && (active ? "bg-slate-600 text-white ring-2 ring-slate-600 ring-offset-2" : "bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200"),
                        )}
                      >
                        {c}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="mt-4 flex justify-end">
                <Link href={`/meetings/${item.meetingId}/agenda`} className="rounded-xl bg-brand-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 transition">
                  View on agenda →
                </Link>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
