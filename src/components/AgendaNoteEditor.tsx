"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";

/**
 * Private per-user notes on an agenda item — shown next to the item wherever
 * it's rendered (the main agenda editor, the meeting room, and the in-call
 * side panel), backed by the same /api/agenda-items/[id]/notes endpoint so
 * a note taken in one place is there in all of them.
 *
 * Deliberately not wrapped in ToastProvider: this renders on the call page
 * too, which has none (see ZoomClientView's doc comment) — feedback is a
 * small inline "Saved" label instead of a toast.
 */
export function AgendaNoteEditor({ itemId, initialNote }: { itemId: number; initialNote?: string | null }) {
  const [expanded, setExpanded] = useState(Boolean(initialNote));
  const [value, setValue] = useState(initialNote ?? "");
  const [saved, setSaved] = useState(initialNote ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const save = async () => {
    if (value === saved) return;
    setStatus("saving");
    try {
      const res = await fetch(`/api/agenda-items/${itemId}/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: value }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSaved(value);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="mt-1.5 flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-brand-700"
      >
        <Icon name="document" className="h-3.5 w-3.5" />
        {expanded ? "Hide my notes" : initialNote ? "My notes" : "Add a note"}
      </button>
      {expanded ? (
        <div className="mt-2 max-w-md">
          <textarea
            value={value}
            onChange={(e) => { setValue(e.target.value); setStatus("idle"); }}
            onBlur={save}
            rows={3}
            placeholder="Private — only you can see this."
            className="w-full rounded-lg border border-cream-300 bg-white p-2 text-sm text-slate-700 focus:border-brand-400 focus:outline-none"
          />
          <div className="mt-1 flex items-center gap-2">
            <button type="button" onClick={save} disabled={value === saved || status === "saving"} className="btn-secondary btn-sm">
              {status === "saving" ? "Saving…" : "Save"}
            </button>
            {status === "saved" && value === saved ? <span className="text-xs text-emerald-600">Saved</span> : null}
            {status === "error" ? <span className="text-xs text-red-600">Couldn&apos;t save — try again.</span> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
