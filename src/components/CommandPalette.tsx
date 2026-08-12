"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icons";
import { cn } from "@/lib/format";

export type CommandItem = { label: string; href: string; icon: string; group: string };

export function CommandTrigger() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("cmdk:open"))}
      className="hidden w-full max-w-md items-center gap-2 rounded-xl border border-cream-300 bg-cream-100/80 py-2 pl-3 pr-2 text-sm text-slate-400 transition hover:border-gold-300 hover:bg-white md:flex"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4"><circle cx="11" cy="11" r="7" /><path d="m20 20-3-3" strokeLinecap="round" /></svg>
      <span className="flex-1 text-left">Search or jump to…</span>
      <kbd className="rounded-md border border-cream-300 bg-cream-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">⌘K</kbd>
    </button>
  );
}

export function CommandPalette({ items }: { items: CommandItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("cmdk:open", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("cmdk:open", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q ? items.filter((i) => i.label.toLowerCase().includes(q) || i.group.toLowerCase().includes(q)) : items;
    const extras: CommandItem[] = q
      ? [{ label: `Search documents for “${query.trim()}”`, href: `/documents?q=${encodeURIComponent(query.trim())}`, icon: "folder", group: "Search" }]
      : [];
    return [...matched, ...extras];
  }, [query, items]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[12vh]" onClick={() => setOpen(false)}>
      <div className="absolute inset-0 bg-ink-950/40 backdrop-blur-sm" />
      <div className="animate-in relative w-full max-w-xl overflow-hidden rounded-2xl border border-cream-300 bg-cream-50 shadow-pop" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-cream-300 px-4">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5 text-slate-400"><circle cx="11" cy="11" r="7" /><path d="m20 20-3-3" strokeLinecap="round" /></svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); if (results[active]) go(results[active].href); }
            }}
            placeholder="Search pages, or jump to…"
            className="w-full bg-transparent py-3.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
          />
          <kbd className="rounded-md border border-cream-300 bg-cream-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">ESC</kbd>
        </div>
        <ul className="max-h-[52vh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-slate-400">No matches.</li>
          ) : (
            results.map((r, i) => (
              <li key={r.href + r.label}>
                <button
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(r.href)}
                  className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm", i === active ? "bg-brand-700 text-cream-50" : "text-slate-700 hover:bg-cream-200")}
                >
                  <Icon name={r.icon} className={cn("h-4 w-4", i === active ? "text-gold-300" : "text-slate-400")} />
                  <span className="flex-1">{r.label}</span>
                  <span className={cn("text-[11px]", i === active ? "text-cream-200" : "text-slate-400")}>{r.group}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
