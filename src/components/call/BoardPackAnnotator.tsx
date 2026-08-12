"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DocViewer } from "@/components/chat/DocViewer";

type Stroke = { color: string; width: number; points: { x: number; y: number }[] };

const COLORS = ["#e11d48", "#2563eb", "#16a34a", "#d97706"];
const POLL_MS = 1500;

/**
 * The board pack, opened as an overlay (not a page navigation) so the live
 * Zoom call in the meeting room keeps running underneath — our own stand-in
 * for Zoom's screen-share annotation, which Component View doesn't expose.
 * Live markup is shared between everyone with the pack open via polling
 * (matching this app's existing pattern for vote/meeting-live updates), not
 * saved with the meeting: it's discussion markup, not a governance record.
 */
export function BoardPackAnnotator({
  packId,
  packVersion,
  onClose,
  canClear,
}: {
  packId: number;
  packVersion: number;
  onClose: () => void;
  canClear: boolean;
}) {
  const [drawing, setDrawing] = useState(false);
  const [color, setColor] = useState(COLORS[0]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const versionRef = useRef(0);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/board-packs/${packId}/annotations`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { strokes: Stroke[]; version: number };
      if (data.version === versionRef.current) return; // nothing new — skip the re-render
      versionRef.current = data.version;
      setStrokes(data.strokes);
    } catch {
      /* network blip — try again next tick */
    }
  }, [packId]);

  useEffect(() => {
    poll();
    const iv = setInterval(poll, POLL_MS);
    return () => clearInterval(iv);
  }, [poll]);

  const handleStrokesChange = useCallback(
    async (next: Stroke[]) => {
      const added = next[next.length - 1];
      if (!added) return;
      try {
        const res = await fetch(`/api/board-packs/${packId}/annotations`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ stroke: added }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { strokes: Stroke[]; version: number };
        // Sync straight from the server's canonical list — avoids drawing the
        // just-added stroke twice (once locally, once from the next poll).
        versionRef.current = data.version;
        setStrokes(data.strokes);
      } catch {
        /* the stroke just won't be shared this round; local canvas already shows it */
      }
    },
    [packId],
  );

  const handleClear = async () => {
    try {
      const res = await fetch(`/api/board-packs/${packId}/annotations`, { method: "DELETE" });
      if (!res.ok) return;
      const data = (await res.json()) as { strokes: Stroke[]; version: number };
      versionRef.current = data.version;
      setStrokes(data.strokes);
    } catch {
      /* try again from the toolbar */
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6" onClick={onClose}>
      <div className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm" />
      <div className="relative flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/60 bg-cream-50 shadow-pop" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cream-300 bg-white px-4 py-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDrawing((d) => !d)}
              className={drawing ? "btn-primary btn-sm" : "btn-secondary btn-sm"}
            >
              {drawing ? "Drawing" : "Draw"}
            </button>
            {drawing ? (
              <div className="flex items-center gap-1">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Colour ${c}`}
                    onClick={() => setColor(c)}
                    className="h-6 w-6 rounded-full border-2"
                    style={{ backgroundColor: c, borderColor: color === c ? "#1c1917" : "transparent" }}
                  />
                ))}
              </div>
            ) : null}
            {canClear && strokes.length > 0 ? (
              <button type="button" onClick={handleClear} className="btn-secondary btn-sm">Clear markup</button>
            ) : null}
          </div>
          <button type="button" onClick={onClose} className="btn-secondary btn-sm">Close</button>
        </div>
        <div className="min-h-0 flex-1">
          <DocViewer
            url={`/api/board-packs/${packId}`}
            name={`board-pack-v${packVersion}.pdf`}
            type="application/pdf"
            onClose={onClose}
            embedded
            drawingMode={drawing}
            drawColor={color}
            strokes={strokes}
            onStrokesChange={handleStrokesChange}
          />
        </div>
      </div>
    </div>
  );
}
