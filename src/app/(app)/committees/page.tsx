import Link from "next/link";
import { requireUser, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { COMMITTEE_TYPES } from "@/lib/enums";
import { PageHeader, Card, Badge, Field, EmptyState } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { createCommittee } from "./actions";

export const dynamic = "force-dynamic";

export default async function CommitteesPage() {
  const user = await requireUser();
  const manage = can(user.role, "committees.manage");
  const committees = await prisma.committee.findMany({
    where: { deletedAt: null },
    include: { _count: { select: { members: true, meetings: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <PageHeader title="Committees" description="Audit, Risk, Nomination and other committees with their own members and meetings." />

      {committees.length === 0 ? (
        <EmptyState title="No committees" hint="Create a committee to track its composition and meetings." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {committees.map((c) => (
            <Link key={c.id} href={`/committees/${c.id}`} className="card p-5 transition hover:border-brand-300">
              <div className="mb-1 flex items-center justify-between">
                <p className="font-semibold text-slate-800">{c.name}</p>
                <Badge tone="purple">{c.type}</Badge>
              </div>
              {c.description ? <p className="line-clamp-2 text-sm text-slate-500">{c.description}</p> : null}
              <p className="mt-3 text-xs text-slate-400">{c._count.members} members · {c._count.meetings} meetings</p>
            </Link>
          ))}
        </div>
      )}

      {manage ? (
        <Card className="mt-6 max-w-xl">
          <h2 className="section-title mb-3">New committee</h2>
          <ActionForm action={createCommittee} submitLabel="Create committee">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" required><input name="name" className="input" required placeholder="e.g. Risk Management Committee" /></Field>
              <Field label="Type">
                <select name="type" className="input" defaultValue="Audit">
                  {COMMITTEE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Description"><textarea name="description" className="input" rows={2} /></Field>
          </ActionForm>
        </Card>
      ) : null}
    </div>
  );
}
