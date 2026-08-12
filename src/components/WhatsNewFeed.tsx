import Link from "next/link";
import type { WhatsNew } from "@/lib/whatsnew";
import { fmtRelative } from "@/lib/format";
import { Badge } from "./ui";
import { Icon } from "./icons";

export function WhatsNewFeed({ data, limit }: { data: WhatsNew; limit?: number }) {
  if (data.total === 0) {
    return <p className="py-6 text-center text-sm text-slate-400">You're all caught up — nothing new since your last visit.</p>;
  }

  type Row = { key: string; icon: string; href: string; title: React.ReactNode; meta: string; when: Date };
  const rows: Row[] = [];

  for (const p of data.boardPacks) {
    rows.push({ key: `bp${p.id}`, icon: "document", href: `/meetings/${p.meeting.id}/board-pack`, title: <>Board pack v{p.version} published</>, meta: p.meeting.title, when: p.publishedAt ?? new Date() });
  }
  for (const d of data.documents) {
    rows.push({
      key: `doc${d.id}`,
      icon: "document",
      href: `/documents/${d.id}/annotate`,
      title: (
        <span className="inline-flex items-center gap-1.5">
          {d.title}
          {d.version > 1 ? <Badge tone="amber">Amended</Badge> : <Badge tone="green">New</Badge>}
        </span>
      ),
      meta: d.meeting?.title ?? d.folder?.name ?? "Document",
      when: d.uploadedAt,
    });
  }
  for (const m of data.minutes) {
    rows.push({ key: `min${m.id}`, icon: "minutes", href: `/meetings/${m.meeting.id}/minutes`, title: <>Minutes {m.status.toLowerCase()}</>, meta: m.meeting.title, when: m.updatedAt });
  }
  for (const a of data.announcements) {
    rows.push({ key: `ann${a.id}`, icon: "chat", href: `/news`, title: a.title, meta: a.category === "SharedDoc" ? "Shared document" : "News", when: a.createdAt });
  }
  for (const ai of data.actions) {
    rows.push({ key: `ai${ai.id}`, icon: "clipboard", href: `/action-items`, title: <>Action assigned: {ai.title}</>, meta: "Action item", when: ai.createdAt });
  }

  rows.sort((a, b) => b.when.getTime() - a.when.getTime());
  const shown = limit ? rows.slice(0, limit) : rows;

  return (
    <ul className="divide-y divide-slate-100">
      {shown.map((r) => (
        <li key={r.key} className="py-2.5">
          <Link href={r.href} className="flex items-start gap-3 hover:opacity-80">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <Icon name={r.icon} className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-slate-800">{r.title}</span>
              <span className="block text-xs text-slate-400">{r.meta} · {fmtRelative(r.when)}</span>
            </span>
          </Link>
        </li>
      ))}
      {limit && rows.length > limit ? (
        <li className="pt-2 text-center">
          <Link href="/whats-new" className="text-sm font-medium text-brand-600 hover:underline">View all {rows.length} updates →</Link>
        </li>
      ) : null}
    </ul>
  );
}
