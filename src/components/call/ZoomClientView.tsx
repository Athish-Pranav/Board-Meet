"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Zoom Meeting SDK — Client View.
 *
 * The full-page meeting experience "identical to the Zoom Web Client" (Zoom's
 * own description) — as opposed to Component View, which embeds a flexible
 * but self-managed box into a page and turned out to fight our layout through
 * many rounds of fixes (floating/draggable toolbar and video window, no
 * reliable way to predict their combined height, and a real SDK bug — a
 * "Maximum update depth exceeded" crash from its Reactions toolbar button).
 * Client View doesn't have that problem because it isn't a box we size at
 * all: it injects its own full-page overlay elements directly, the same way
 * a real Zoom meeting tab looks.
 *
 * Because of that, this component owns the whole page it's rendered on, not
 * a container within one — see src/app/call/[id]/page.tsx.
 */
// If init/join's success/error callbacks never fire — a hung network request,
// a stuck WASM download, stale SDK state left over from an earlier attempt in
// the same tab — the page would otherwise sit on "Connecting…" forever with
// no way out except knowing to hard-refresh. This bounds that wait.
const JOIN_TIMEOUT_MS = 25000;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out ${label} — this usually clears up with a hard refresh (Ctrl+Shift+R).`)), JOIN_TIMEOUT_MS);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

export function ZoomClientView({ meetingId, leaveUrl }: { meetingId: number; leaveUrl: string }) {
  const [status, setStatus] = useState<"loading" | "joined" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const zoomMtgRef = useRef<any>(null);
  const joinedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (!window.isSecureContext || !navigator.mediaDevices) {
          throw new Error(
            "Video needs a secure (https) connection. This page was opened over plain http from another machine, so the browser blocks camera and microphone access.",
          );
        }

        const res = await withTimeout(
          fetch("/api/zoom/signature", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ meetingId }),
          }),
          "requesting a join signature",
        );
        if (!res.ok) throw new Error(await res.text());
        const { signature, meetingNumber, passcode, userName, userEmail } = await res.json();
        if (cancelled) return;

        const { ZoomMtg } = await import("@zoom/meetingsdk");
        if (cancelled) return;
        zoomMtgRef.current = ZoomMtg;

        ZoomMtg.preLoadWasm();
        ZoomMtg.prepareWebSDK();

        await withTimeout(
          new Promise<void>((resolve, reject) => {
            ZoomMtg.init({
              leaveUrl,
              patchJsMedia: true,
              success: () => resolve(),
              error: (err: unknown) => reject(err),
            });
          }),
          "initializing the Zoom SDK",
        );
        if (cancelled) return;

        await withTimeout(
          new Promise<void>((resolve, reject) => {
            ZoomMtg.join({
              signature,
              meetingNumber,
              userName,
              userEmail,
              passWord: passcode,
              success: () => resolve(),
              error: (err: unknown) => reject(err),
            });
          }),
          "joining the meeting",
        );
        if (cancelled) return;
        joinedRef.current = true;
        setStatus("joined");
      } catch (err) {
        if (cancelled) return;
        console.error("[zoom-client-view] failed to join meeting", err);
        setError(describeError(err));
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      // Normally the user leaves through Zoom's own UI, which navigates to
      // leaveUrl and tears everything down via a real page unload. This is a
      // safety net for the case where our component unmounts some other way
      // (e.g. a SPA navigation via the app's own nav bar) without that —
      // otherwise the camera/mic can stay captured.
      if (joinedRef.current) {
        try {
          zoomMtgRef.current?.leaveMeeting?.({});
        } catch {
          /* already gone */
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId, leaveUrl]);

  if (status === "joined") return null; // Client View has taken over the page.

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6 text-center">
      {status === "loading" ? (
        <p className="text-sm text-slate-500">Connecting to the Zoom meeting…</p>
      ) : (
        <div className="space-y-2">
          <p className="font-medium text-rose-700">Couldn&apos;t start the video call.</p>
          <p className="text-sm text-slate-500">{error}</p>
        </div>
      )}
    </div>
  );
}

/** The Meeting SDK rejects with plain objects, not Error instances. */
function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const e = err as { reason?: string; message?: string; errorCode?: number | string; type?: string };
    const parts = [e.reason ?? e.message ?? e.type, e.errorCode != null ? `(code ${e.errorCode})` : null].filter(Boolean);
    if (parts.length) return parts.join(" ");
    try {
      return JSON.stringify(err);
    } catch {
      /* circular */
    }
  }
  return "Could not start the video call.";
}
