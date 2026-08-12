"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { CommandTrigger } from "./CommandPalette";
import { UserMenu } from "./UserMenu";
import { cn } from "@/lib/format";
import type { NavGroup } from "./Nav";

const DESC: Record<string, string> = {
  "/whats-new": "Unseen updates",
  "/meetings": "Board & committee meetings",
  "/calendar": "12-month view",
  "/documents": "Repository & papers",
  "/minutes": "The minute book",
  "/action-items": "Tasks & follow-ups",
  "/resolutions": "Voting & sign-off",
  "/committees": "Members & charters",
  "/conflicts": "Interest register",
  "/compliance": "Companies Act checks",
  "/news": "Announcements",
  "/reports": "Attendance & KPIs",
  "/assistant": "Ask about decisions",
  "/audit": "Activity trail",
  "/users": "People & roles",
  "/settings": "Profile & retention",
};

export function TopNav({
  groups,
  user,
  unread,
}: {
  groups: NavGroup[];
  user: { name: string; email: string; role: string };
  unread: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(null);
    setMobile(false);
  }, [pathname]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const groupActive = (g: NavGroup) => g.items.some((i) => isActive(i.href));

  // Dashboard is a direct link; remove it from any dropdown to avoid duplication.
  const menus = groups
    .map((g) => ({ ...g, items: g.items.filter((i) => i.href !== "/dashboard") }))
    .filter((g) => g.items.length > 0);

  return (
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-4">
      <div
        ref={ref}
        className="mx-auto flex h-14 max-w-[1500px] items-center gap-2 rounded-2xl border border-white/60 bg-white/70 px-3 shadow-soft backdrop-blur-xl"
      >
        {/* Brand */}
        <Link href="/dashboard" className="flex items-center pl-1 pr-2">
          <img src="/logo.png" alt="Precot Logo" className="h-8 w-auto" />
        </Link>

        <div className="mx-1 hidden h-6 w-px bg-cream-300 lg:block" />

        {/* Primary nav (desktop) */}
        <nav className="hidden flex-1 items-center gap-0.5 lg:flex">
          <Link
            href="/dashboard"
            className={cn(
              "rounded-xl px-3 py-2 text-sm font-medium transition-colors",
              isActive("/dashboard") ? "bg-brand-50 text-brand-800" : "text-slate-600 hover:bg-cream-200 hover:text-brand-900",
            )}
          >
            Dashboard
          </Link>

          {menus.map((g) => {
            const active = groupActive(g);
            const isOpen = open === g.label;
            return (
              <div key={g.label} className="relative">
                <button
                  onClick={() => setOpen(isOpen ? null : g.label)}
                  className={cn(
                    "flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                    active || isOpen ? "bg-brand-50 text-brand-800" : "text-slate-600 hover:bg-cream-200 hover:text-brand-900",
                  )}
                >
                  {g.label}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")}><path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>

                {isOpen ? (
                  <div className="animate-in absolute left-0 top-full z-50 mt-2 w-[300px] rounded-2xl border border-white/60 bg-white/85 p-2 shadow-pop backdrop-blur-xl">
                    {g.items.map((item) => {
                      const a = isActive(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn("flex items-start gap-3 rounded-xl p-2.5 transition-colors", a ? "bg-brand-50" : "hover:bg-cream-200")}
                        >
                          <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", a ? "bg-gradient-to-br from-brand-600 to-brand-800 text-cream-50" : "bg-cream-200 text-brand-700")}>
                            <Icon name={item.icon} className="h-[18px] w-[18px]" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-brand-900">{item.label}</span>
                            <span className="block text-xs text-slate-500">{DESC[item.href] ?? ""}</span>
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="flex flex-1 items-center justify-end gap-1.5 lg:flex-none">
          <div className="hidden md:block"><CommandTrigger /></div>
          <Link href="/notifications" className="relative rounded-xl p-2 text-slate-500 transition-colors hover:bg-cream-200 hover:text-brand-900" aria-label="Notifications">
            <Icon name="bell" />
            {unread > 0 ? (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">{unread > 9 ? "9+" : unread}</span>
            ) : null}
          </Link>
          <div className="mx-0.5 hidden h-6 w-px bg-cream-300 sm:block" />
          <UserMenu name={user.name} email={user.email} role={user.role} />

          {/* Mobile menu toggle */}
          <button onClick={() => setMobile((v) => !v)} className="rounded-xl p-2 text-slate-600 hover:bg-cream-200 lg:hidden" aria-label="Menu">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5"><path d={mobile ? "M6 6l12 12M18 6 6 18" : "M4 7h16M4 12h16M4 17h16"} strokeLinecap="round" /></svg>
          </button>
        </div>
      </div>

      {/* Mobile sheet */}
      {mobile ? (
        <div className="animate-in mx-auto mt-2 max-w-[1500px] rounded-2xl border border-white/60 bg-white/90 p-3 shadow-pop backdrop-blur-xl lg:hidden">
          <Link href="/dashboard" className={cn("mb-2 block rounded-xl px-3 py-2 text-sm font-semibold", isActive("/dashboard") ? "bg-brand-50 text-brand-800" : "text-slate-700 hover:bg-cream-200")}>Dashboard</Link>
          {menus.map((g) => (
            <div key={g.label} className="mb-2">
              <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{g.label}</p>
              <div className="grid grid-cols-2 gap-1">
                {g.items.map((item) => (
                  <Link key={item.href} href={item.href} className={cn("flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm", isActive(item.href) ? "bg-brand-50 text-brand-800" : "text-slate-700 hover:bg-cream-200")}>
                    <Icon name={item.icon} className="h-4 w-4 text-slate-400" />
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </header>
  );
}
