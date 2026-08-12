"use client";

import { useState, useTransition } from "react";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { Badge, Field } from "@/components/ui";
import { addMember, removeMember, updateMemberRole } from "../actions";
import { useToast } from "@/components/Toast";

interface Member {
  id: number;
  role: string;
  user: {
    id: number;
    name: string;
    email?: string;
    designation: string | null;
  };
}

interface Candidate {
  id: number;
  name: string;
  designation?: string | null;
}

export function CommitteeMembersManager({
  committeeId,
  members,
  candidates,
  manage,
}: {
  committeeId: number;
  members: Member[];
  candidates: Candidate[];
  manage: boolean;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  const handleRoleChange = async (memberId: number, newRole: string) => {
    const fd = new FormData();
    fd.append("committeeId", String(committeeId));
    fd.append("memberId", String(memberId));
    fd.append("role", newRole);

    startTransition(async () => {
      const res = await updateMemberRole({}, fd);
      if (res?.error) {
        toast({ type: "error", message: res.error });
      } else {
        toast({ type: "success", message: `Role updated to ${newRole}` });
      }
    });
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="section-title">Members ({members.length})</h2>
        {manage && candidates.length > 0 && !showAddForm ? (
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="btn-secondary btn-sm inline-flex items-center gap-1"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="h-3.5 w-3.5"
            >
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            Add Member
          </button>
        ) : null}
      </div>

      {showAddForm && manage ? (
        <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50/50 p-4 animate-in fade-in duration-200">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-brand-900">Add user to committee</p>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Cancel
            </button>
          </div>
          <ActionForm
            action={async (prev, fd) => {
              const res = await addMember(prev, fd);
              if (res?.ok) {
                setShowAddForm(false);
              }
              return res;
            }}
            submitLabel="Add to Committee"
            successToast="Member added successfully"
            footer={
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="btn-secondary btn-sm"
              >
                Cancel
              </button>
            }
          >
            <input type="hidden" name="committeeId" value={committeeId} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Select Person" required>
                <select name="userId" className="input" defaultValue="" required>
                  <option value="" disabled>
                    Choose a user…
                  </option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.designation ? `(${c.designation})` : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Committee Role" required>
                <select name="role" className="input" defaultValue="Member">
                  <option value="Member">Member</option>
                  <option value="Chair">Chair</option>
                </select>
              </Field>
            </div>
          </ActionForm>
        </div>
      ) : null}

      {members.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
          No members in this committee yet.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {members.map((m) => {
            const initials = m.user.name
              .split(" ")
              .map((n) => n[0])
              .filter(Boolean)
              .slice(0, 2)
              .join("")
              .toUpperCase();

            return (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-xs text-brand-800">
                    {initials || "U"}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {m.user.name}
                    </p>
                    <p className="text-xs text-slate-400">
                      {m.user.designation || m.user.email || "—"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {manage ? (
                    <select
                      value={m.role}
                      disabled={isPending}
                      onChange={(e) => handleRoleChange(m.id, e.target.value)}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    >
                      <option value="Member">Member</option>
                      <option value="Chair">Chair</option>
                    </select>
                  ) : (
                    <Badge tone={m.role === "Chair" ? "blue" : "gray"}>
                      {m.role}
                    </Badge>
                  )}

                  {manage ? (
                    <ActionForm
                      action={removeMember}
                      successToast="Member removed"
                      className="!space-y-0"
                    >
                      <input type="hidden" name="committeeId" value={committeeId} />
                      <input type="hidden" name="memberId" value={m.id} />
                      <ConfirmSubmit
                        confirmLabel="Remove Member"
                        className="btn-danger btn-sm p-1.5"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.8}
                          className="h-4 w-4"
                        >
                          <path
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </ConfirmSubmit>
                    </ActionForm>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {manage && candidates.length === 0 && members.length > 0 ? (
        <p className="mt-3 text-xs text-slate-400">
          All active users are members of this committee.
        </p>
      ) : null}
    </div>
  );
}
