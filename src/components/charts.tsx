// Dependency-free SVG chart kit. Server-rendered (no hydration), themeable via
// hex colors. IDs are unique per render via a module counter.
let _uid = 0;
const nextId = (p: string) => `${p}-${++_uid}`;

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

export function ProgressRing({
  value,
  size = 132,
  stroke = 12,
  color = "#4f46e5",
  track = "#e8ecf4",
  label,
  sublabel,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  label?: string;
  sublabel?: string;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - clamp(value) / 100);
  const gid = nextId("ring");
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={color} />
          <stop offset="100%" stopColor="#bf9a4c" />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={`url(#${gid})`}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle" className="fill-slate-900" style={{ fontSize: size * 0.26, fontWeight: 800 }}>
        {label ?? `${Math.round(value)}%`}
      </text>
      {sublabel ? (
        <text x="50%" y="64%" textAnchor="middle" dominantBaseline="middle" className="fill-slate-400" style={{ fontSize: size * 0.1, fontWeight: 600 }}>
          {sublabel}
        </text>
      ) : null}
    </svg>
  );
}

export type DonutSegment = { value: number; color: string; label: string };

export function Donut({ segments, size = 150, stroke = 20, centerLabel, centerSub }: { segments: DonutSegment[]; size?: number; stroke?: number; centerLabel?: string; centerSub?: string }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0);
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef1f7" strokeWidth={stroke} />
      {total > 0 &&
        segments.map((seg, i) => {
          const len = (seg.value / total) * circ;
          const el = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={stroke}
              strokeDasharray={`${len} ${circ - len}`}
              strokeDashoffset={-acc}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              strokeLinecap="butt"
            />
          );
          acc += len;
          return el;
        })}
      {centerLabel ? (
        <text x="50%" y="47%" textAnchor="middle" dominantBaseline="middle" className="fill-slate-900" style={{ fontSize: size * 0.22, fontWeight: 800 }}>
          {centerLabel}
        </text>
      ) : null}
      {centerSub ? (
        <text x="50%" y="62%" textAnchor="middle" dominantBaseline="middle" className="fill-slate-400" style={{ fontSize: size * 0.09, fontWeight: 600 }}>
          {centerSub}
        </text>
      ) : null}
    </svg>
  );
}

export function AreaChart({ data, width = 320, height = 90, color = "#4f46e5", showDots = true }: { data: number[]; width?: number; height?: number; color?: string; showDots?: boolean }) {
  if (!data.length) return null;
  const gid = nextId("area");
  const max = Math.max(...data, 1);
  const pad = 6;
  const n = data.length;
  const pts = data.map((v, i) => {
    const x = n === 1 ? width / 2 : (i / (n - 1)) * (width - pad * 2) + pad;
    const y = height - pad - (v / max) * (height - pad * 2);
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[n - 1][0].toFixed(1)},${height} L${pts[0][0].toFixed(1)},${height} Z`;
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="overflow-visible">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {showDots ? <circle cx={pts[n - 1][0]} cy={pts[n - 1][1]} r={3.5} fill={color} /> : null}
    </svg>
  );
}

export function Bars({ data, height = 130, color = "#2a3d63" }: { data: { label: string; value: number }[]; height?: number; color?: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {data.map((d, i) => {
        const h = Math.max(4, (d.value / max) * (height - 24));
        return (
          <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
            <span className="text-[10px] font-semibold text-slate-400">{d.value || ""}</span>
            <div className="flex w-full items-end justify-center" style={{ height: height - 24 }}>
              <div className="w-full max-w-[26px] rounded-t-md transition-all" style={{ height: h, background: `linear-gradient(to top, ${color}, #bf9a4c)` }} title={`${d.label}: ${d.value}`} />
            </div>
            <span className="text-[10px] text-slate-400">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Sparkline({ data, color = "#4f46e5", width = 120, height = 36 }: { data: number[]; color?: string; width?: number; height?: number }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * height}`);
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
