"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type LiveMeeting = { id: number; title: string };

const POLL_MS = 20000;
const DISMISSED_KEY = "bm.dismissedLiveMeetings";

/**
 * "The board meeting has started" prompt.
 *
 * Polls for meetings the current user may join that the secretariat has marked
 * in session, and offers a one-click way into the meeting room. Replaces the
 * call notifier that was removed when the custom WebRTC call was swapped for
 * Zoom — without it, invitees had no way of knowing a call had begun.
 *
 * Dismissals are per-tab (sessionStorage): unlike a vote, a live meeting can
 * run for an hour, and re-nagging on every poll would be intolerable.
 */
export function LiveMeetingNotifier() {
  const pathname = usePathname();
  const [meetings, setMeetings] = useState<LiveMeeting[]>([]);
  const [dismissed, setDismissed] = useState<number[]>([]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DISMISSED_KEY);
      if (raw) setDismissed(JSON.parse(raw) as number[]);
    } catch {
      /* storage unavailable — just show the prompt */
    }
  }, []);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/meetings/live", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as { meetings: LiveMeeting[] };
      setMeetings(json.meetings ?? []);
    } catch {
      /* network blip — try again next tick */
    }
  }, []);

  useEffect(() => {
    poll();
    const iv = setInterval(poll, POLL_MS);
    const onWake = () => {
      if (document.visibilityState === "visible") poll();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [poll]);

  const dismiss = (id: number) => {
    const next = [...dismissed, id];
    setDismissed(next);
    try {
      sessionStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable — dismissal lasts for this render only */
    }
  };

  // Don't nag someone who is already sitting in the meeting room.
  const visible = meetings.filter((m) => !dismissed.includes(m.id) && pathname !== `/meetings/${m.id}/room`);
  if (visible.length === 0) return null;

  return (
    <div className="fixed bottom-6 left-6 z-40 flex w-[22rem] max-w-[calc(100vw-3rem)] flex-col gap-3">
      {visible.map((m) => (
        <div
          key={m.id}
          className="animate-in slide-in-from-bottom-4 overflow-hidden rounded-2xl border border-emerald-300 bg-cream-50 shadow-pop duration-300"
        >
          <div className="h-1 bg-gradient-to-r from-emerald-400 via-emerald-600 to-emerald-400" />
          <div className="p-4">
            <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-600" />
              </span>
              Meeting in session
            </span>
            <p className="mt-2 font-serif text-lg font-bold leading-snug text-brand-900">{m.title}</p>
            <p className="mt-1 text-sm text-slate-500">The video meeting has started.</p>
            <div className="mt-4 flex gap-2">
              <Link href={`/meetings/${m.id}/room`} className="btn-primary flex-1 justify-center">
                Join now →
              </Link>
              <button type="button" onClick={() => dismiss(m.id)} className="btn-secondary btn-sm">
                Later
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
