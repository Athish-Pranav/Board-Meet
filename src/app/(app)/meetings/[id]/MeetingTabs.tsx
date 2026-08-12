"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/format";

export function MeetingTabs({ id, mode }: { id: number; mode?: string }) {
  const pathname = usePathname();
  const base = `/meetings/${id}`;
  // Agenda + board-pack + voting companion, shared by every meeting mode. For
  // Video/Hybrid meetings it also shows the "Join Zoom Meeting" link — the
  // actual call happens in Zoom's own app, not embedded in this app.
  const tabs = [
    { href: base, label: "Overview" },
    { href: `${base}/agenda`, label: "Agenda" },
    { href: `${base}/board-pack`, label: "Board Pack" },
    { href: `${base}/attendance`, label: "Attendance" },
    { href: `${base}/minutes`, label: "Minutes" },
    { href: `${base}/room`, label: "Meeting Room" },
  ];
  return (
    <div className="mb-5 flex flex-wrap gap-1 border-b border-slate-200">
      {tabs.map((t) => {
        const active = t.href === base ? pathname === base : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              active ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
