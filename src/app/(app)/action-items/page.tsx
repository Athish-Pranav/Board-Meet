import Link from "next/link";
import { requireUser, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { fmtDate, fmtRelative } from "@/lib/format";
import { ACTION_STATUS, ACTION_STATUS_LABELS } from "@/lib/enums";
import { PageHeader, Card, Table, StatusBadge, Badge, Field, EmptyState } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { createActionItem, updateActionStatus, reassignAction, runEscalations } from "./actions";

export const dynamic = "force-dynamic";

export default async function ActionItemsPage({ searchParams }: { searchParams: { scope?: string; status?: string } }) {
  const user = await requireUser();
  const scope = searchParams.scope === "all" ? "all" : "mine";
  const statusFilter = ACTION_STATUS.includes(searchParams.status as never) ? searchParams.status : undefined;
  const canAssign = can(user.role, "actions.assign");
  const canCreate = can(user.role, "actions.create");

  const [items, people, meetings] = await Promise.all([
    prisma.actionItem.findMany({
      where: {
        deletedAt: null,
        ...(scope === "mine" ? { assigneeId: user.id } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      include: { assignee: { select: { id: true, name: true } }, meeting: { select: { id: true, title: true } } },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    }),
    prisma.user.findMany({ where: { deletedAt: null, status: "Active" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.meeting.findMany({ where: { deletedAt: null }, select: { id: true, title: true }, orderBy: { scheduledAt: "desc" }, take: 50 }),
  ]);

  const now = new Date();

  return (
    <div>
      <PageHeader
        title="Action Items"
        description="Tasks arising from meetings and minutes, with due dates and escalation."
        actions={
          canAssign ? (
            <ActionForm action={runEscalations} submitLabel="Run escalations" submitVariant="secondary" className="!space-y-0" />
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="flex gap-1">
          {[{ k: "mine", l: "My items" }, { k: "all", l: "All" }].map((t) => (
            <Link key={t.k} href={`/action-items?scope=${t.k}${statusFilter ? `&status=${statusFilter}` : ""}`} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${scope === t.k ? "bg-brand-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}>{t.l}</Link>
          ))}
        </div>
        <div className="flex gap-1">
          {[{ k: "", l: "Any status" }, ...ACTION_STATUS.map((s) => ({ k: s, l: ACTION_STATUS_LABELS[s] }))].map((t) => (
            <Link key={t.k} href={`/action-items?scope=${scope}${t.k ? `&status=${t.k}` : ""}`} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${(t.k || undefined) === statusFilter ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}>{t.l}</Link>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState title="No action items" hint="Action items created from minutes and meetings will appear here." />
      ) : (
        <Table
          head={
            <>
              <th className="th">Item</th>
              <th className="th">Assignee</th>
              <th className="th">Due</th>
              <th className="th">Status</th>
              <th className="th">Update</th>
            </>
          }
        >
          {items.map((item) => {
            const overdue = item.status !== "Done" && item.dueDate < now;
            const canUpdate = item.assignee.id === user.id || canAssign;
            return (
              <tr key={item.id} className="hover:bg-slate-50">
                <td className="td">
                  <p className="font-medium text-slate-800">{item.title}</p>
                  {item.meeting ? <Link href={`/meetings/${item.meeting.id}`} className="text-xs text-brand-600 hover:underline">{item.meeting.title}</Link> : null}
                  {item.escalatedAt ? <Badge tone="red">Escalated</Badge> : null}
                </td>
                <td className="td">{item.assignee.name}</td>
                <td className="td">
                  {fmtDate(item.dueDate)}
                  <div className={`text-xs ${overdue ? "text-red-500" : "text-slate-400"}`}>{fmtRelative(item.dueDate)}</div>
                </td>
                <td className="td"><StatusBadge status={overdue ? "Overdue" : item.status} /></td>
                <td className="td">
                  {canUpdate ? (
                    <div className="flex flex-col gap-1">
                      <ActionForm action={updateActionStatus} className="!space-y-0">
                        <input type="hidden" name="itemId" value={item.id} />
                        <div className="flex items-center gap-1">
                          <select name="status" defaultValue={item.status === "Overdue" ? "Open" : item.status} className="input !w-auto py-1 text-xs">
                            {ACTION_STATUS.filter((s) => s !== "Overdue").map((s) => <option key={s} value={s}>{ACTION_STATUS_LABELS[s]}</option>)}
                          </select>
                          <button className="btn-secondary btn-sm">Set</button>
                        </div>
                      </ActionForm>
                      {canAssign ? (
                        <ActionForm action={reassignAction} className="!space-y-0">
                          <input type="hidden" name="itemId" value={item.id} />
                          <div className="flex items-center gap-1">
                            <select name="assigneeId" defaultValue={item.assignee.id} className="input !w-auto py-1 text-xs">
                              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                            <button className="btn-secondary btn-sm">Reassign</button>
                          </div>
                        </ActionForm>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
      )}

      {canCreate ? (
        <Card className="mt-6 max-w-2xl">
          <h2 className="section-title mb-3">New action item</h2>
          <ActionForm action={createActionItem} submitLabel="Create action item">
            <Field label="Title" required><input name="title" className="input" required /></Field>
            <Field label="Description"><textarea name="description" className="input" rows={2} /></Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Assignee" required>
                <select name="assigneeId" className="input" defaultValue="">
                  <option value="">Select…</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              <Field label="Due date" required><input type="date" name="dueDate" className="input" required /></Field>
              <Field label="From meeting">
                <select name="meetingId" className="input" defaultValue="">
                  <option value="">None</option>
                  {meetings.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
                </select>
              </Field>
            </div>
          </ActionForm>
        </Card>
      ) : null}
    </div>
  );
}
