import Link from "next/link";
import { requireUser, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { PageHeader, Card, Table, Badge, Field, EmptyState } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { declareConflict, withdrawConflict } from "./actions";

export const dynamic = "force-dynamic";

export default async function ConflictsPage() {
  const user = await requireUser();
  const canDeclare = can(user.role, "conflicts.declare");
  // Register is visible to directors and the secretariat/chairman/admin.
  const canView = canDeclare || ["CompanySecretary", "CFO", "Chairman", "ManagingDirector"].includes(user.role) || user.isDirector;

  const [declarations, meetings] = await Promise.all([
    canView
      ? prisma.conflictDeclaration.findMany({
          where: { deletedAt: null },
          include: { user: { select: { name: true } }, meeting: { select: { id: true, title: true } }, agendaItem: { select: { title: true } } },
          orderBy: { recordedAt: "desc" },
        })
      : Promise.resolve([]),
    prisma.meeting.findMany({ where: { deletedAt: null }, select: { id: true, title: true }, orderBy: { scheduledAt: "desc" }, take: 50 }),
  ]);

  return (
    <div>
      <PageHeader title="Declarations of Interest" description="Register of directors' interests under the Companies Act (s.184) and SS-1." />

      {canView ? (
        declarations.length === 0 ? (
          <EmptyState title="No declarations recorded" hint="Directors declare interests here; entries are linked to the relevant meeting or agenda item." />
        ) : (
          <Table
            head={
              <>
                <th className="th">Director</th>
                <th className="th">Nature of interest</th>
                <th className="th">Linked to</th>
                <th className="th">Recused</th>
                <th className="th">Recorded</th>
                <th className="th"></th>
              </>
            }
          >
            {declarations.map((d) => (
              <tr key={d.id} className="hover:bg-slate-50">
                <td className="td font-medium text-slate-800">{d.user.name}</td>
                <td className="td max-w-md whitespace-pre-wrap">{d.nature}</td>
                <td className="td">
                  {d.meeting ? <Link href={`/meetings/${d.meeting.id}`} className="text-brand-600 hover:underline">{d.meeting.title}</Link> : "—"}
                  {d.agendaItem ? <div className="text-xs text-slate-400">{d.agendaItem.title}</div> : null}
                </td>
                <td className="td">{d.recused ? <Badge tone="amber">Recused</Badge> : <span className="text-slate-300">No</span>}</td>
                <td className="td">{fmtDate(d.recordedAt)}</td>
                <td className="td">
                  {d.user && d.userId === user.id ? (
                    <ActionForm action={withdrawConflict} className="!space-y-0">
                      <input type="hidden" name="id" value={d.id} />
                      <button className="btn-secondary btn-sm">Withdraw</button>
                    </ActionForm>
                  ) : null}
                </td>
              </tr>
            ))}
          </Table>
        )
      ) : (
        <EmptyState title="Restricted" hint="The declarations register is visible to directors and the secretariat." />
      )}

      {canDeclare ? (
        <Card className="mt-6 max-w-2xl">
          <h2 className="section-title mb-3">Declare an interest</h2>
          <ActionForm action={declareConflict} submitLabel="Record declaration">
            <Field label="Nature of interest" required>
              <textarea name="nature" rows={3} className="input" placeholder="e.g. I am a director of the counterparty company…" required />
            </Field>
            <Field label="Related meeting">
              <select name="meetingId" className="input" defaultValue="">
                <option value="">None / general</option>
                {meetings.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" name="recused" className="rounded border-slate-300" /> I will recuse myself from discussion and voting on this matter
            </label>
          </ActionForm>
        </Card>
      ) : null}
    </div>
  );
}
