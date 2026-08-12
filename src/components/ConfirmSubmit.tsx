"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/format";

/**
 * Two-step inline confirmation for destructive submits. First click reveals
 * Confirm / Cancel; only Confirm actually submits the form. Prevents accidental
 * cancellations/deletions without a heavy modal.
 */
export function ConfirmSubmit({
  children,
  confirmLabel = "Confirm",
  className,
}: {
  children: React.ReactNode;
  confirmLabel?: string;
  className?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const { pending } = useFormStatus();

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className={cn("btn-danger btn-sm", className)}>
        {children}
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <button type="submit" disabled={pending} className="btn-danger btn-sm">
        {pending ? "Working…" : confirmLabel}
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="btn-secondary btn-sm">
        Keep
      </button>
    </span>
  );
}
