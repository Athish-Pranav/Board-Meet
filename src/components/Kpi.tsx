import Link from "next/link";
import { Icon } from "./icons";
import { Sparkline } from "./charts";
import { cn } from "@/lib/format";

type Tone = "brand" | "emerald" | "amber" | "rose" | "gold";

const TONE: Record<Tone, { chip: string; glow: string; hex: string; trendUp: string; trendDown: string }> = {
  brand: { chip: "from-brand-600 to-brand-800", glow: "bg-brand-400/20", hex: "#2a3d63", trendUp: "text-emerald-600", trendDown: "text-rose-600" },
  gold: { chip: "from-gold-400 to-gold-600", glow: "bg-gold-300/30", hex: "#bf9a4c", trendUp: "text-emerald-600", trendDown: "text-rose-600" },
  emerald: { chip: "from-emerald-500 to-teal-600", glow: "bg-emerald-400/20", hex: "#0f9d6e", trendUp: "text-emerald-600", trendDown: "text-rose-600" },
  amber: { chip: "from-amber-400 to-gold-500", glow: "bg-amber-400/20", hex: "#d99a2b", trendUp: "text-emerald-600", trendDown: "text-rose-600" },
  rose: { chip: "from-rose-500 to-red-600", glow: "bg-rose-400/20", hex: "#e11d48", trendUp: "text-emerald-600", trendDown: "text-rose-600" },
};

export function KpiCard({
  label,
  value,
  icon,
  tone = "brand",
  trend,
  spark,
  hint,
  href,
}: {
  label: string;
  value: React.ReactNode;
  icon: string;
  tone?: Tone;
  trend?: { dir: "up" | "down" | "flat"; text: string };
  spark?: number[];
  hint?: string;
  href?: string;
}) {
  const t = TONE[tone];
  const inner = (
    <div className="card hover-lift relative h-full overflow-hidden p-5">
      <div className={cn("pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full blur-2xl", t.glow)} />
      <div className="relative flex items-start justify-between">
        <span className={cn("flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm", t.chip)}>
          <Icon name={icon} className="h-5 w-5" />
        </span>
        {trend ? (
          <span className={cn("inline-flex items-center gap-0.5 rounded-full bg-slate-50 px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ring-slate-200", trend.dir === "down" ? t.trendDown : trend.dir === "up" ? t.trendUp : "text-slate-500")}>
            {trend.dir === "up" ? "▲" : trend.dir === "down" ? "▼" : "•"} {trend.text}
          </span>
        ) : null}
      </div>
      <p className="relative mt-4 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
      <p className="relative mt-0.5 text-sm font-medium text-slate-500">{label}</p>
      {hint ? <p className="relative text-xs text-slate-400">{hint}</p> : null}
      {spark && spark.length > 1 ? (
        <div className="relative mt-3 h-8 opacity-80">
          <Sparkline data={spark} color={t.hex} />
        </div>
      ) : null}
    </div>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}
