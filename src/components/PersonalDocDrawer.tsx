"use client";

import { useEffect, useRef, useState } from "react";
import { DocViewer } from "@/components/chat/DocViewer";

type Stroke = { color: string; width: number; points: { x: number; y: number }[] };

const COLORS = ["#e11d48", "#2563eb", "#16a34a", "#d97706"];

/**
 * An agenda document opened as an overlay (not a page navigation — on the
 * call page that would unmount ZoomClientView and drop the live call), with
 * private freehand drawing/highlighting: each person's own markup, saved to
 * /api/documents/[id]/drawing, visible only to them.
 *
 * Distinct from BoardPackAnnotator, which is shared/live across everyone
 * viewing the pack — this has no polling loop at all, since there's no other
 * viewer to stay in sync with; strokes load once on open and save on change.
 */
export function PersonalDocDrawer({
  documentId,
  fileName,
  mimeType,
  onClose,
}: {
  documentId: number;
  fileName: string;
  mimeType: string;
  onClose: () => void;
}) {
  const [drawing, setDrawing] = useState(false);
  const [color, setColor] = useState(COLORS[0]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const loaded = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/documents/${documentId}/drawing`, { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { strokes: Stroke[] };
          setStrokes(data.strokes);
        }
      } catch {
        /* start blank rather than block opening the document */
      } finally {
        loaded.current = true;
      }
    })();
  }, [documentId]);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = async (next: Stroke[]) => {
    try {
      await fetch(`/api/documents/${documentId}/drawing`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ strokes: next }),
      });
    } catch {
      /* the mark stays visible locally even if this particular save drops */
    }
  };

  const handleStrokesChange = (next: Stroke[]) => {
    setStrokes(next);
    // Debounce saves so rapid strokes don't hammer the server and block the
    // main thread waiting on fetch/serialisation.
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => void save(next), 800);
  };

  const handleClear = () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setStrokes([]);
    void save([]);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6" onClick={onClose}>
      <div className="absolute inset-0 bg-ink-950/60   backdrop-blur-sm" />
      <div className="relative flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/60 bg-cream-50 shadow-pop" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cream-300 bg-white px-4 py-2">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setDrawing((d) => !d)} className={drawing ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>
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
            {strokes.length > 0 ? (
              <button type="button" onClick={handleClear} className="btn-secondary btn-sm">Clear my marks</button>
            ) : null}
            <span className="text-xs text-slate-400">Private — only you can see this</span>
          </div>
          <button type="button" onClick={onClose} className="btn-secondary btn-sm">Close</button>
        </div>
        <div className="min-h-0 flex-1">
          <DocViewer
            url={`/api/documents/${documentId}`}
            name={fileName}
            type={mimeType}
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
