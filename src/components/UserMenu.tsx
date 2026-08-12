"use client";

import { useState, useRef, useEffect } from "react";
import { initials } from "@/lib/format";
import { ROLE_LABELS, type Role } from "@/lib/enums";
import { Icon } from "./icons";
import { logoutAction } from "@/app/(app)/_actions";

export function UserMenu({ name, email, role }: { name: string; email: string; role: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
          {initials(name)}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block text-sm font-medium leading-tight text-slate-800">{name}</span>
          <span className="block text-xs leading-tight text-slate-400">{ROLE_LABELS[role as Role] ?? role}</span>
        </span>
      </button>

      {open ? (
        <div className="animate-in absolute right-0 z-30 mt-2 w-60 rounded-2xl border border-slate-200/80 bg-white p-2 shadow-pop">
          <div className="px-3 py-2">
            <p className="text-sm font-medium text-slate-800">{name}</p>
            <p className="truncate text-xs text-slate-400">{email}</p>
          </div>
          <div className="my-1 border-t border-slate-100" />
          <form action={logoutAction}>
            <button type="submit" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
              <Icon name="logout" className="h-4 w-4 text-slate-400" />
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
