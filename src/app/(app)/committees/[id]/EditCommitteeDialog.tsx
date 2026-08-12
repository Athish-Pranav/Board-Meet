"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ActionForm } from "@/components/ActionForm";
import { Field } from "@/components/ui";
import { COMMITTEE_TYPES } from "@/lib/enums";
import { updateCommittee } from "../actions";

interface Committee {
  id: number;
  name: string;
  type: string;
  description: string | null;
}

export function EditCommitteeDialog({ committee }: { committee: Committee }) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close modal on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  const modalContent = isOpen ? (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Full screen backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
        onClick={() => setIsOpen(false)}
      />

      {/* Modal Dialog Box */}
      <div
        className="relative z-10 w-full max-w-lg my-auto rounded-2xl border border-cream-300 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 className="font-serif text-xl font-semibold text-brand-900">
              Edit Committee
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Update committee name, classification, and charter details.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="h-5 w-5"
            >
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <ActionForm
          action={async (prev, fd) => {
            const res = await updateCommittee(prev, fd);
            if (res?.ok) {
              setIsOpen(false);
            }
            return res;
          }}
          submitLabel="Save Changes"
          successToast="Committee updated successfully"
          footer={
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="btn-secondary"
            >
              Cancel
            </button>
          }
        >
          <input type="hidden" name="id" value={committee.id} />

          <div className="space-y-4">
            <Field label="Committee Name" required>
              <input
                name="name"
                defaultValue={committee.name}
                className="input"
                required
                placeholder="e.g. Audit Committee"
              />
            </Field>

            <Field label="Committee Type" required>
              <select
                name="type"
                className="input"
                defaultValue={committee.type}
              >
                {COMMITTEE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Description / Charter">
              <textarea
                name="description"
                defaultValue={committee.description ?? ""}
                className="input"
                rows={4}
                placeholder="Describe the scope, mandate, and objectives of this committee..."
              />
            </Field>
          </div>
        </ActionForm>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="btn-secondary inline-flex items-center gap-1.5"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          className="h-4 w-4"
        >
          <path
            d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Edit Committee
      </button>

      {mounted && modalContent ? createPortal(modalContent, document.body) : null}
    </>
  );
}
