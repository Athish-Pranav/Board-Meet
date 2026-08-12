"use client";

import { useEffect, useRef } from "react";
import { useFormState } from "react-dom";
import { SubmitButton } from "./SubmitButton";
import { useToast } from "./Toast";
import { cn } from "@/lib/format";
import type { FormResult } from "@/lib/form";

export type { FormResult };

type Action = (prevState: FormResult, formData: FormData) => Promise<FormResult>;

/**
 * Wraps a server action with useFormState. Validation errors render inline AND
 * raise a toast; successful (non-redirecting) actions raise a success toast so
 * every mutation gives the user feedback.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  submitVariant = "primary",
  className,
  footer,
  successToast = "Saved",
}: {
  action: Action;
  children?: React.ReactNode;
  submitLabel?: string;
  submitVariant?: "primary" | "secondary" | "danger";
  className?: string;
  footer?: React.ReactNode;
  successToast?: string | null;
}) {
  const [state, formAction] = useFormState(action, {});
  const toast = useToast();
  const last = useRef<FormResult>({});

  useEffect(() => {
    if (state === last.current) return;
    last.current = state;
    if (state?.error) toast({ type: "error", message: state.error });
    else if (state?.ok && successToast) toast({ type: "success", message: successToast });
  }, [state, toast, successToast]);

  return (
    <form action={formAction} className={cn("space-y-4", className)}>
      {state?.error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</div>
      ) : null}
      {children}
      {submitLabel ? (
        <div className="flex items-center gap-2 pt-1">
          <SubmitButton variant={submitVariant}>{submitLabel}</SubmitButton>
          {footer}
        </div>
      ) : (
        footer
      )}
    </form>
  );
}
