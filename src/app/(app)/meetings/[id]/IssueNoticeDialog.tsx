"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useToast } from "@/components/Toast";
import { sendNotice } from "../actions";
import { cn } from "@/lib/format";

interface User {
  id: number;
  name: string;
  email: string;
}

interface Meeting {
  id: number;
  title: string;
  scheduledAt: Date | string;
  noticeSentAt: Date | string | null;
  shortNoticeConsent: boolean;
  shortNoticeNote: string | null;
}

interface IssueNoticeDialogProps {
  meeting: Meeting;
  users: User[];
  defaultEmails: string[];
}

export function IssueNoticeDialog({ meeting, users, defaultEmails }: IssueNoticeDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [to, setTo] = useState<string[]>(defaultEmails);
  const [cc, setCc] = useState<string[]>([]);
  const [bcc, setBcc] = useState<string[]>([]);
  const [subject, setSubject] = useState(`Notice of meeting: ${meeting.title}`);
  
  // Format meeting date properly for body prepopulation
  const formattedDate = useMemo(() => {
    const d = new Date(meeting.scheduledAt);
    return d.toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }, [meeting.scheduledAt]);

  const [body, setBody] = useState(
    `Formal notice for "${meeting.title}" on ${formattedDate}.`
  );
  
  const [shortNoticeConsent, setShortNoticeConsent] = useState(meeting.shortNoticeConsent);
  const [shortNoticeNote, setShortNoticeNote] = useState(meeting.shortNoticeNote || "");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  // Reset state when modal closes/opens
  useEffect(() => {
    if (isOpen) {
      setTo(defaultEmails);
      setCc([]);
      setBcc([]);
      setSubject(`Notice of meeting: ${meeting.title}`);
      setBody(`Formal notice for "${meeting.title}" on ${formattedDate}.`);
      setShortNoticeConsent(meeting.shortNoticeConsent);
      setShortNoticeNote(meeting.shortNoticeNote || "");
      setAttachments([]);
    }
  }, [isOpen, defaultEmails, meeting, formattedDate]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      // Validate file size (24MB limit per file)
      const validFiles = filesArray.filter((file) => {
        if (file.size > 24 * 1024 * 1024) {
          toast({ type: "error", message: `File "${file.name}" exceeds 24 MB limit.` });
          return false;
        }
        return true;
      });
      setAttachments((prev) => [...prev, ...validFiles]);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (to.length === 0) {
      toast({ type: "error", message: "At least one recipient (TO) is required." });
      return;
    }

    const formData = new FormData();
    formData.append("id", String(meeting.id));
    formData.append("to", to.join(","));
    formData.append("cc", cc.join(","));
    formData.append("bcc", bcc.join(","));
    formData.append("subject", subject);
    formData.append("body", body);
    formData.append("shortNoticeConsent", String(shortNoticeConsent));
    formData.append("shortNoticeNote", shortNoticeNote);

    attachments.forEach((file) => {
      formData.append("attachments", file);
    });

    startTransition(async () => {
      const res = await sendNotice({}, formData);
      if (res.error) {
        toast({ type: "error", message: res.error });
      } else {
        toast({ type: "success", message: "Meeting notice sent successfully!" });
        setIsOpen(false);
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-full btn-secondary text-center justify-center font-medium animate-in duration-100"
      >
        {meeting.noticeSentAt ? "Re-issue notice" : "Issue notice"}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
            onClick={() => !isPending && setIsOpen(false)}
          />

          {/* Modal Container */}
          <div className="animate-in fade-in zoom-in-95 duration-200 relative bg-cream-50 w-full max-w-2xl rounded-2xl border border-cream-300 shadow-pop flex flex-col max-h-[90vh] overflow-hidden z-10">
            {/* Header */}
            <div className="px-6 py-4 border-b border-cream-300 flex items-center justify-between bg-white bg-opacity-95">
              <div>
                <h3 className="text-lg font-semibold text-slate-800">
                  {meeting.noticeSentAt ? "Re-issue Meeting Notice" : "Issue Meeting Notice"}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Send formal notice via email to directors and committee members
                </p>
              </div>
              <button
                type="button"
                disabled={isPending}
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 rounded-lg p-1 transition disabled:opacity-50"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
              <div className="p-6 space-y-4 overflow-y-auto flex-1 bg-white/50">
                
                {/* Recipients Row */}
                <div className="space-y-3.5">
                  <MultiEmailSelector
                    label="To"
                    placeholder="Search users or type email..."
                    users={users}
                    selected={to}
                    onChange={setTo}
                    disabled={isPending}
                  />

                  <MultiEmailSelector
                    label="Cc"
                    placeholder="Search users or type email..."
                    users={users}
                    selected={cc}
                    onChange={setCc}
                    disabled={isPending}
                  />

                  <MultiEmailSelector
                    label="Bcc"
                    placeholder="Search users or type email..."
                    users={users}
                    selected={bcc}
                    onChange={setBcc}
                    disabled={isPending}
                  />
                </div>

                <hr className="border-cream-300 my-2" />

                {/* Subject */}
                <div className="space-y-1">
                  <label className="label text-slate-700 font-medium">Subject</label>
                  <input
                    type="text"
                    required
                    disabled={isPending}
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="input w-full bg-white focus:bg-white"
                    placeholder="Enter email subject"
                  />
                </div>

                {/* Body */}
                <div className="space-y-1">
                  <label className="label text-slate-700 font-medium">Email Body</label>
                  <textarea
                    required
                    rows={4}
                    disabled={isPending}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    className="input w-full bg-white focus:bg-white min-h-[100px] resize-y py-2.5"
                    placeholder="Enter email text content"
                  />
                </div>

                {/* Shorter Notice Settings */}
                <div className="rounded-xl border border-cream-300 bg-cream-100/50 p-4.5 space-y-3">
                  <label className="flex items-start gap-2.5 text-sm text-slate-700 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={isPending}
                      checked={shortNoticeConsent}
                      onChange={(e) => setShortNoticeConsent(e.target.checked)}
                      className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 mt-1"
                    />
                    <div>
                      <span>Shorter notice consent (s.173(3))</span>
                      <p className="text-xs font-normal text-slate-500 mt-0.5">
                        Enable if the meeting is called on short notice with the written consent of directors.
                      </p>
                    </div>
                  </label>
                  {shortNoticeConsent && (
                    <div className="animate-in slide-in-from-top-2 duration-200">
                      <input
                        type="text"
                        disabled={isPending}
                        value={shortNoticeNote}
                        onChange={(e) => setShortNoticeNote(e.target.value)}
                        placeholder="Consent note / explanation (optional)"
                        className="input w-full bg-white focus:bg-white text-sm"
                      />
                    </div>
                  )}
                </div>

                {/* Attachments Section */}
                <div className="space-y-2">
                  <label className="label text-slate-700 font-medium">Attachments</label>
                  <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-cream-300 hover:border-brand-300 rounded-xl cursor-pointer hover:bg-white bg-white/40 transition">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <svg className="w-7 h-7 mb-1.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p className="text-xs text-slate-500">
                        <span className="font-semibold text-brand-600 hover:text-brand-700">Click to upload</span> multiple files (Max 24MB each)
                      </p>
                    </div>
                    <input
                      type="file"
                      multiple
                      disabled={isPending}
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>

                  {/* List of files to upload */}
                  {attachments.length > 0 && (
                    <ul className="divide-y divide-cream-200 border border-cream-200 rounded-lg overflow-hidden bg-white">
                      {attachments.map((file, idx) => (
                        <li key={idx} className="flex items-center justify-between p-2.5 text-xs text-slate-700">
                          <div className="flex items-center gap-2 truncate">
                            <svg className="h-4 w-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span className="font-medium truncate">{file.name}</span>
                            <span className="text-[10px] text-slate-400 font-normal shrink-0">
                              ({(file.size / (1024 * 1024)).toFixed(2)} MB)
                            </span>
                          </div>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => removeAttachment(idx)}
                            className="text-red-500 hover:text-red-700 transition p-1 rounded hover:bg-red-50 disabled:opacity-50"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

              </div>

              {/* Footer */}
              <div className="px-6 py-4 bg-cream-100 border-t border-cream-300 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => setIsOpen(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="btn-primary min-w-[120px] justify-center"
                >
                  {isPending ? "Sending Notice..." : "Send Notice"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

interface MultiEmailSelectorProps {
  label: string;
  placeholder: string;
  users: User[];
  selected: string[];
  onChange: (emails: string[]) => void;
  disabled?: boolean;
}

function MultiEmailSelector({ label, placeholder, users, selected, onChange, disabled }: MultiEmailSelectorProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    const available = users.filter((u) => !selected.includes(u.email));
    if (!q) {
      // Return first 10 suggestions if query is empty
      return available.slice(0, 10);
    }
    return available.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
    );
  }, [query, users, selected]);

  const addEmail = (email: string) => {
    const clean = email.trim();
    if (clean && !selected.includes(clean)) {
      onChange([...selected, clean]);
    }
    setQuery("");
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  const removeEmail = (email: string) => {
    onChange(selected.filter((e) => e !== email));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (isOpen && activeIndex >= 0 && filteredUsers[activeIndex]) {
        addEmail(filteredUsers[activeIndex].email);
      } else if (query.trim() && query.includes("@") && query.includes(".")) {
        addEmail(query);
      } else if (query.trim()) {
        // Fallback: search if user tries to enter a non-email string
        const matches = filteredUsers;
        if (matches.length > 0) {
          addEmail(matches[0].email);
        }
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setIsOpen(true);
      setActiveIndex((prev) => Math.min(prev + 1, filteredUsers.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIsOpen(true);
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
    } else if (e.key === "Backspace" && !query && selected.length > 0) {
      removeEmail(selected[selected.length - 1]);
    }
  };

  return (
    <div ref={containerRef} className="space-y-1 relative">
      <div className="flex items-center justify-between">
        <span className="label text-slate-700 font-medium text-xs">{label}</span>
        {isOpen && query.trim() && (
          <span className="text-[10px] text-slate-400 font-normal">
            Press Enter/Comma to add custom email
          </span>
        )}
      </div>

      <div 
        onClick={() => !disabled && inputRef.current?.focus()}
        className={cn(
          "flex flex-wrap items-center gap-1.5 p-2 rounded-lg border border-slate-300 bg-white focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-brand-500 min-h-[42px] cursor-text transition",
          disabled && "bg-slate-50 cursor-not-allowed opacity-70"
        )}
      >
        {selected.map((email) => {
          const user = users.find((u) => u.email === email);
          return (
            <span 
              key={email} 
              className="inline-flex items-center gap-1 bg-brand-50 text-brand-700 text-xs font-semibold px-2 py-0.5 rounded-md border border-brand-100 transition max-w-[280px] truncate"
            >
              <span className="truncate">{user ? `${user.name} (${email})` : email}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeEmail(email);
                  }}
                  className="text-brand-400 hover:text-brand-600 transition p-0.5"
                >
                  ✕
                </button>
              )}
            </span>
          );
        })}
        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={selected.length === 0 ? placeholder : ""}
          className="flex-grow min-w-[120px] bg-transparent outline-none border-0 p-0 text-sm focus:ring-0 text-slate-800 disabled:cursor-not-allowed"
        />
      </div>

      {isOpen && !disabled && filteredUsers.length > 0 && (
        <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filteredUsers.map((u, i) => {
            // Get initials
            const initials = u.name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2)
              .toUpperCase();

            return (
              <div
                key={u.id}
                onClick={() => addEmail(u.email)}
                onMouseEnter={() => setActiveIndex(i)}
                className={cn(
                  "px-3 py-2 text-sm cursor-pointer transition flex items-center justify-between gap-2",
                  i === activeIndex ? "bg-brand-50 text-slate-800" : "text-slate-700 hover:bg-slate-50"
                )}
              >
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-700 shrink-0">
                    {initials}
                  </div>
                  <span className="font-medium truncate">{u.name}</span>
                </div>
                <span className="text-slate-400 text-xs shrink-0">{u.email}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
