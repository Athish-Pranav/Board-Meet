import { redirect } from "next/navigation";
import { requireUser, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { PageHeader, Table, Badge, EmptyState } from "@/components/ui";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function AuditPage({ searchParams }: { searchParams: { entity?: string; q?: string } }) {
  const user = await requireUser();
  const viewAll = can(user.role, "audit.viewAll");
  const viewOwn = can(user.role, "audit.viewOwn");
  if (!viewAll && !viewOwn) redirect("/403");

  let scope: Prisma.AuditLogWhereInput = {};
  if (!viewAll) {
    // CS: own meetings + their own actions.
    const own = await prisma.meeting.findMany({ where: { createdById: user.id }, select: { id: true } });
    scope = { OR: [{ meetingId: { in: own.map((m) => m.id) } }, { actorId: user.id }] };
  }

  const entity = (searchParams.entity ?? "").trim();
  const q = (searchParams.q ?? "").trim();
  const where: Prisma.AuditLogWhereInput = {
    AND: [
      scope,
      ...(entity ? [{ entityType: entity }] : []),
      // Text search must never surface a vote row by its (historical) choice text —
      // exclude vote actions from summary matching so the choice can't be inferred.
      ...(q ? [{ summary: { contains: q }, NOT: { action: "vote" } }] : []),
    ],
  };

  const logs = await prisma.auditLog.findMany({
    where,
    include: { actor: { select: { name: true } } },
    orderBy: { at: "desc" },
    take: 300,
  });

  const entities = ["", "Meeting", "AgendaItem", "BoardPack", "Document", "Minutes", "ActionItem", "User", "Attendance"];

  return (
    <div>
      <PageHeader title="Audit Log" description={viewAll ? "Every write, with actor and timestamp." : "Activity on your meetings."} />

      <form className="mb-4 flex flex-wrap gap-2">
        <select name="entity" defaultValue={entity} className="input max-w-xs">
          {entities.map((e) => <option key={e} value={e}>{e || "All entities"}</option>)}
        </select>
        <input name="q" defaultValue={q} placeholder="Search summary…" className="input max-w-xs" />
        <button className="btn-secondary">Filter</button>
      </form>

      {logs.length === 0 ? (
        <EmptyState title="No audit entries" hint="Actions across the system will appear here." />
      ) : (
        <Table
          head={
            <>
              <th className="th">When</th>
              <th className="th">Actor</th>
              <th className="th">Action</th>
              <th className="th">Entity</th>
              <th className="th">Summary</th>
            </>
          }
        >
          {logs.map((l) => (
            <tr key={l.id} className="hover:bg-slate-50">
              <td className="td whitespace-nowrap text-xs text-slate-500">{fmtDateTime(l.at)}</td>
              <td className="td">{l.actor?.name ?? "System"}</td>
              <td className="td"><Badge tone="blue">{l.action}</Badge></td>
              <td className="td text-xs text-slate-500">{l.entityType}{l.entityId ? ` #${l.entityId}` : ""}</td>
              {/* Vote choices are confidential — never reveal who voted for what,
                  including for any historical rows that stored the choice. */}
              <td className="td">{l.action === "vote" ? <span className="text-slate-400">Vote recorded (confidential)</span> : (l.summary ?? "—")}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
