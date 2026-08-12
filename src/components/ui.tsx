import Link from "next/link";
import { cn } from "@/lib/format";

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-1.5">{eyebrow}</p> : null}
        <h1 className="font-serif text-[28px] font-semibold leading-tight tracking-tight text-brand-900">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm text-slate-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("card p-5", className)}>{children}</div>;
}

export type Tone = "gray" | "green" | "amber" | "red" | "blue" | "purple" | "gold";

const TONE_CLASSES: Record<Tone, string> = {
  gray: "bg-cream-200 text-slate-600 ring-cream-300",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  blue: "bg-brand-50 text-brand-700 ring-brand-200",
  purple: "bg-violet-50 text-violet-700 ring-violet-200",
  gold: "bg-gold-50 text-gold-700 ring-gold-200",
};

export function Badge({ tone = "gray", children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={cn("badge", TONE_CLASSES[tone])}>{children}</span>;
}

const STATUS_TONES: Record<string, Tone> = {
  Draft: "gray",
  Scheduled: "blue",
  InSession: "amber",
  Concluded: "green",
  Cancelled: "red",
  Circulated: "amber",
  Approved: "green",
  Published: "green",
  Passed: "green",
  Failed: "red",
  Withdrawn: "gray",
  Open: "blue",
  InProgress: "amber",
  Done: "green",
  Overdue: "red",
  Active: "green",
  Suspended: "amber",
  Inactive: "gray",
  Present: "green",
  PresentViaVideo: "green",
  LeaveOfAbsence: "amber",
  Absent: "red",
  Invited: "gray",
  Pending: "amber",
  Sent: "blue",
  Read: "gray",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const tone = STATUS_TONES[status] ?? "gray";
  return (
    <span className={cn("badge", TONE_CLASSES[tone])}>
      <span className={cn("h-1.5 w-1.5 rounded-full", {
        "bg-slate-400": tone === "gray",
        "bg-emerald-500": tone === "green",
        "bg-amber-500": tone === "amber",
        "bg-red-500": tone === "red",
        "bg-brand-500": tone === "blue",
        "bg-violet-500": tone === "purple",
        "bg-gold-500": tone === "gold",
      })} />
      {label ?? status}
    </span>
  );
}

export function SeverityBadge({ severity, children }: { severity: "ok" | "warn" | "breach"; children: React.ReactNode }) {
  const tone: Tone = severity === "ok" ? "green" : severity === "warn" ? "amber" : "red";
  return <Badge tone={tone}>{children}</Badge>;
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-2 p-12 text-center">
      <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-2xl bg-cream-200 text-gold-500">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-6 w-6">
          <path d="M5 7a2 2 0 0 1 2-2h3l2 2h5a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" strokeLinejoin="round" />
        </svg>
      </div>
      <p className="font-semibold text-slate-700">{title}</p>
      {hint ? <p className="max-w-md text-sm text-slate-500">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
  required,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="label">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-400">{hint}</span> : null}
    </label>
  );
}

export function Table({ head, children }: { head: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200/70">
          <thead className="bg-slate-50/80">
            <tr>{head}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">{children}</tbody>
        </table>
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "blue",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "blue" | "amber" | "red" | "green";
}) {
  const accent = { blue: "text-brand-600", amber: "text-amber-600", red: "text-red-600", green: "text-emerald-600" }[tone];
  const dot = { blue: "bg-brand-500", amber: "bg-amber-500", red: "bg-red-500", green: "bg-emerald-500" }[tone];
  return (
    <div className="card card-hover p-4">
      <div className="flex items-center gap-2">
        <span className={cn("h-2 w-2 rounded-full", dot)} />
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      </div>
      <p className={cn("mt-1.5 text-2xl font-bold", accent)}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}

export function LinkButton({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
}) {
  return (
    <Link href={href} className={variant === "primary" ? "btn-primary" : "btn-secondary"}>
      {children}
    </Link>
  );
}
