import Link from "next/link";
import { requireUser } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { fmtDate } from "@/lib/format";
import { synthesizeAnswer } from "@/lib/assistant";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

function snippet(text: string, q: string, len = 240): string {
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text.slice(0, len) + (text.length > len ? "…" : "");
  const start = Math.max(0, idx - 60);
  return (start > 0 ? "…" : "") + text.slice(start, start + len) + "…";
}

export default async function AssistantPage({ searchParams }: { searchParams: { q?: string } }) {
  await requireUser();
  const q = (searchParams.q ?? "").trim();

  let minutes: { id: number; content: string; meeting: { id: number; title: string; scheduledAt: Date } }[] = [];
  let resolutions: { id: number; title: string; description: string | null; votingStatus: string; meeting: { id: number; title: string } }[] = [];
  let answer: string | null = null;

  if (q) {
    [minutes, resolutions] = await Promise.all([
      prisma.minutes.findMany({
        where: { content: { contains: q }, meeting: { deletedAt: null } },
        include: { meeting: { select: { id: true, title: true, scheduledAt: true } } },
        take: 8,
        orderBy: { meeting: { scheduledAt: "desc" } },
      }),
      // Resolutions are "For Approval" agenda items.
      prisma.agendaItem.findMany({
        where: { deletedAt: null, classification: "ForApproval", meeting: { deletedAt: null }, OR: [{ description: { contains: q } }, { title: { contains: q } }] },
        select: { id: true, title: true, description: true, votingStatus: true, meeting: { select: { id: true, title: true } } },
        take: 8,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    if (env.anthropic.enabled && (minutes.length || resolutions.length)) {
      const context = [
        ...minutes.map((m) => `[Minutes — ${m.meeting.title}, ${fmtDate(m.meeting.scheduledAt)}]\n${m.content}`),
        ...resolutions.map((r) => `[Resolution — ${r.title} (${r.votingStatus})]\n${r.description ?? ""}`),
      ].join("\n\n---\n\n");
      answer = await synthesizeAnswer(q, context.slice(0, 12000));
    }
  }

  return (
    <div>
      <PageHeader
        title="Assistant"
        description="Ask about past decisions. Searches the minute book and resolutions."
        actions={env.anthropic.enabled ? <Badge tone="green">Claude {env.anthropic.model}</Badge> : <Badge tone="gray">Search mode</Badge>}
      />

      <form className="mb-6 flex gap-2">
        <input name="q" defaultValue={q} className="input" placeholder='e.g. "What did we decide on the dividend last quarter?"' />
        <button className="btn-primary">Ask</button>
      </form>

      {!q ? (
        <EmptyState title="Ask a question" hint="Try: what was approved about the audited financials? Which resolutions passed this year?" />
      ) : (
        <div className="space-y-5">
          {answer ? (
            <Card className="border-brand-200 bg-brand-50/40">
              <h2 className="section-title mb-2">Answer</h2>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{answer}</p>
              <p className="mt-2 text-xs text-slate-400">Generated from the excerpts below. Verify against the source records.</p>
            </Card>
          ) : null}

          {minutes.length === 0 && resolutions.length === 0 ? (
            <EmptyState title="No matches" hint="No minutes or resolutions mention that term." />
          ) : (
            <>
              {minutes.length > 0 ? (
                <Card>
                  <h2 className="section-title mb-3">From the minutes</h2>
                  <ul className="space-y-3">
                    {minutes.map((m) => (
                      <li key={m.id} className="rounded-lg border border-slate-100 p-3">
                        <Link href={`/meetings/${m.meeting.id}/minutes`} className="text-sm font-medium text-brand-700 hover:underline">{m.meeting.title}</Link>
                        <span className="ml-2 text-xs text-slate-400">{fmtDate(m.meeting.scheduledAt)}</span>
                        <p className="mt-1 text-sm text-slate-600">{snippet(m.content, q)}</p>
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}
              {resolutions.length > 0 ? (
                <Card>
                  <h2 className="section-title mb-3">From resolutions</h2>
                  <ul className="space-y-3">
                    {resolutions.map((r) => (
                      <li key={r.id} className="rounded-lg border border-slate-100 p-3">
                        <Link href={`/meetings/${r.meeting.id}/agenda`} className="text-sm font-medium text-brand-700 hover:underline">{r.title}</Link>
                        <Badge tone="gray">{r.votingStatus}</Badge>
                        <span className="ml-2 text-xs text-slate-400">{r.meeting.title}</span>
                        <p className="mt-1 text-sm text-slate-600">{snippet(r.description ?? "", q)}</p>
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}
