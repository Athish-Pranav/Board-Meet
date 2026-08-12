"use client";

import { useState } from "react";
import { Card, Badge } from "@/components/ui";
import { BoardPackAnnotator } from "@/components/call/BoardPackAnnotator";

type PackLite = { id: number; version: number; status: string; ready: boolean } | null;

/**
 * Opens the board pack as an overlay rather than navigating to a new page —
 * keeps the director's place on the room's tabs instead of losing it.
 */
export function PackCard({ pack, canClearAnnotations }: { pack: PackLite; canClearAnnotations: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <h2 className="section-title mb-3">Board pack</h2>
      {pack && pack.ready ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge tone={pack.status === "Published" ? "green" : "gray"}>{pack.status}</Badge>
            <span className="text-sm text-slate-600">Version {pack.version}</span>
          </div>
          <button type="button" onClick={() => setOpen(true)} className="btn-primary w-full justify-center">
            Open board pack
          </button>
          {open ? (
            <BoardPackAnnotator packId={pack.id} packVersion={pack.version} onClose={() => setOpen(false)} canClear={canClearAnnotations} />
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-slate-400">No compiled board pack yet. Compile it from the Board Pack tab.</p>
      )}
    </Card>
  );
}
