"use client";

import { useState } from "react";
import { ActionForm, type FormResult } from "@/components/ActionForm";
import { Field } from "@/components/ui";
import { MEETING_TYPES, MEETING_TYPE_LABELS, MEETING_MODES, type MeetingType } from "@/lib/enums";
import { toLocalInput, cn } from "@/lib/format";

type MeetingDefaults = {
  id?: number;
  type?: string;
  committeeId?: number | null;
  title?: string;
  description?: string | null;
  scheduledAt?: Date | string;
  venue?: string | null;
  mode?: string;
  meetingLink?: string | null;
};

export function MeetingForm({
  action,
  committees,
  meeting,
  submitLabel = "Save meeting",
}: {
  action: (prev: FormResult, fd: FormData) => Promise<FormResult>;
  committees: { id: number; name: string }[];
  meeting?: MeetingDefaults;
  submitLabel?: string;
}) {
  const [type, setType] = useState<string>(meeting?.type ?? "Board");
  const [mode, setMode] = useState<string>(meeting?.mode ?? "Physical");

  return (
    <ActionForm action={action} submitLabel={submitLabel}>
      {meeting?.id ? <input type="hidden" name="id" value={meeting.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Meeting type" required>
          <select name="type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
            {MEETING_TYPES.map((t) => (
              <option key={t} value={t}>
                {MEETING_TYPE_LABELS[t as MeetingType]}
              </option>
            ))}
          </select>
        </Field>
        {type === "Committee" ? (
          <Field label="Committee" required>
            <select name="committeeId" className="input" defaultValue={meeting?.committeeId ?? ""}>
              <option value="">Select committee…</option>
              {committees.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Mode">
            <select name="mode" className="input" value={mode} onChange={(e) => setMode(e.target.value)}>
              {MEETING_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      {type === "Committee" ? (
        <Field label="Mode">
          <select name="mode" className="input" value={mode} onChange={(e) => setMode(e.target.value)}>
            {MEETING_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      <Field label="Title" required>
        <input name="title" className="input" defaultValue={meeting?.title ?? ""} placeholder="e.g. Q2 FY25-26 Board Meeting" required />
      </Field>

      <Field label="Description">
        <textarea name="description" className="input" rows={3} defaultValue={meeting?.description ?? ""} />
      </Field>

      <div className={cn("grid gap-4", mode !== "Video" && "sm:grid-cols-2")}>
        <Field label="Date & time" required>
          <input name="scheduledAt" type="datetime-local" className="input" defaultValue={toLocalInput(meeting?.scheduledAt)} required />
        </Field>
        {/* A purely video meeting has no physical venue. Hybrid keeps it —
            part of that meeting still happens in a room. */}
        {mode !== "Video" ? (
          <Field label="Venue">
            <input name="venue" className="input" defaultValue={meeting?.venue ?? ""} placeholder="Registered Office / Boardroom" />
          </Field>
        ) : null}
      </div>

      <Field label="Meeting link (Teams / Zoom / Webex)" hint="Members can join video meetings from this link.">
        <input name="meetingLink" className="input" defaultValue={meeting?.meetingLink ?? ""} placeholder="https://…" />
      </Field>
    </ActionForm>
  );
}
