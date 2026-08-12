import { Icon } from "./icons";
import { cn } from "@/lib/format";

// Agenda / paper recognition symbols (spec): paper type, video, protected,
// version, comments, approval/new status.
export type PaperMeta = {
  mimeType?: string | null;
  fileName?: string | null;
  classification?: string | null; // Confidential | Restricted | Internal
  version?: number;
  isNew?: boolean;
  comments?: number;
  restricted?: boolean; // presenter-only / protected
  hasVideo?: boolean;
};

function fileKind(mimeType?: string | null, fileName?: string | null): string {
  const f = (fileName ?? "").toLowerCase();
  if (mimeType === "application/pdf" || f.endsWith(".pdf")) return "PDF";
  if ((mimeType ?? "").startsWith("image/") || /\.(png|jpe?g|gif|webp)$/.test(f)) return "IMG";
  if (/\.(docx?|rtf)$/.test(f)) return "DOC";
  if (/\.(xlsx?|csv)$/.test(f)) return "XLS";
  if (/\.(pptx?)$/.test(f)) return "PPT";
  return "FILE";
}

function Chip({ title, tone, children }: { title: string; tone: string; children: React.ReactNode }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold", tone)}>
      {children}
    </span>
  );
}

export function PaperSymbols(meta: PaperMeta) {
  const protectedPaper = meta.restricted || meta.classification === "Confidential" || meta.classification === "Restricted";
  return (
    <span className="inline-flex flex-wrap items-center gap-1 align-middle">
      <Chip title="Paper type" tone="bg-slate-100 text-slate-600">{fileKind(meta.mimeType, meta.fileName)}</Chip>
      {typeof meta.version === "number" && meta.version > 1 ? <Chip title={`Version ${meta.version} — amended`} tone="bg-amber-100 text-amber-800">v{meta.version} · Amended</Chip> : typeof meta.version === "number" ? <Chip title="Version 1" tone="bg-slate-100 text-slate-500">v{meta.version}</Chip> : null}
      {meta.isNew ? <Chip title="Newly added" tone="bg-emerald-100 text-emerald-800">New</Chip> : null}
      {protectedPaper ? <Chip title="Protected / restricted paper" tone="bg-red-100 text-red-700"><Icon name="shield" className="h-3 w-3" /> Protected</Chip> : null}
      {meta.hasVideo ? <Chip title="Video link available" tone="bg-violet-100 text-violet-700"><Icon name="link" className="h-3 w-3" /> Video</Chip> : null}
      {meta.comments && meta.comments > 0 ? <Chip title={`${meta.comments} annotation(s)`} tone="bg-brand-100 text-brand-700"><Icon name="chat" className="h-3 w-3" /> {meta.comments}</Chip> : null}
    </span>
  );
}

export function PaperSymbolsLegend() {
  return (
    <div className="flex flex-wrap gap-2 text-[11px] text-slate-500">
      <span className="rounded bg-slate-100 px-1.5 py-0.5">PDF/IMG/DOC = paper type</span>
      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">Amended = new version</span>
      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800">New = recently added</span>
      <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700">Protected = restricted paper</span>
      <span className="rounded bg-brand-100 px-1.5 py-0.5 text-brand-700">comments = annotations</span>
    </div>
  );
}
