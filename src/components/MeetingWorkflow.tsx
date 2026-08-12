import Link from "next/link";
import { cn } from "@/lib/format";

export type Step = {
  label: string;
  hint: string;
  href: string;
  status: "done" | "current" | "todo";
};

export function MeetingWorkflow({ steps }: { steps: Step[] }) {
  const done = steps.filter((s) => s.status === "done").length;
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-cream-300 bg-cream-100/60 px-5 py-3">
        <h2 className="section-title">Workflow</h2>
        <span className="text-xs font-semibold text-slate-500">{done} of {steps.length} complete</span>
      </div>
      <ol className="relative p-5">
        {steps.map((s, i) => (
          <li key={s.label} className="relative flex gap-3 pb-5 last:pb-0">
            {i < steps.length - 1 && <span className={cn("absolute left-[13px] top-7 h-[calc(100%-1rem)] w-px", s.status === "done" ? "bg-gold-300" : "bg-cream-300")} />}
            <span
              className={cn(
                "z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-1",
                s.status === "done" && "bg-gold-500 text-white ring-gold-500",
                s.status === "current" && "bg-cream-50 text-brand-900 ring-gold-400 shadow-gold",
                s.status === "todo" && "bg-cream-100 text-slate-400 ring-cream-300",
              )}
            >
              {s.status === "done" ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="h-3.5 w-3.5"><path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
              ) : (
                i + 1
              )}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-center justify-between gap-2">
                <p className={cn("text-sm", s.status === "current" ? "font-semibold text-brand-900" : s.status === "done" ? "text-slate-500" : "text-slate-600")}>{s.label}</p>
                {s.status !== "done" ? (
                  <Link href={s.href} className={cn("shrink-0 text-xs font-semibold", s.status === "current" ? "text-gold-700 hover:text-gold-800" : "text-slate-400 hover:text-slate-600")}>
                    {s.status === "current" ? "Do this →" : "Open"}
                  </Link>
                ) : null}
              </div>
              <p className="text-xs text-slate-400">{s.hint}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
