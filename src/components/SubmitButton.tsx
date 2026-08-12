"use client";

import { useFormStatus } from "react-dom";
import { cn } from "@/lib/format";

export function SubmitButton({
  children,
  className,
  variant = "primary",
  pendingLabel = "Working…",
}: {
  children: React.ReactNode;
  className?: string;
  variant?: "primary" | "secondary" | "danger";
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  const base = variant === "primary" ? "btn-primary" : variant === "danger" ? "btn-danger" : "btn-secondary";
  return (
    <button type="submit" disabled={pending} className={cn(base, className)}>
      {pending ? pendingLabel : children}
    </button>
  );
}
