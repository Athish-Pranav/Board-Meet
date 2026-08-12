import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { PageHeader, Card, Badge, StatusBadge } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { deleteCommittee } from "../actions";
import { EditCommitteeDialog } from "./EditCommitteeDialog";
import { CommitteeMembersManager } from "./CommitteeMembersManager";

export const dynamic = "force-dynamic";

export default async function CommitteeDetail({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const id = Number(params.id);
  const committee = await prisma.committee.findUnique({
    where: { id },
    include: {
      members: {
        include: {
          user: { select: { id: true, name: true, designation: true, email: true } },
        },
        orderBy: { role: "asc" },
      },
      meetings: { where: { deletedAt: null }, orderBy: { scheduledAt: "desc" }, take: 20 },
    },
  });
  if (!committee || committee.deletedAt) notFound();

  const manage = can(user.role, "committees.manage");
  const memberIds = new Set(committee.members.map((m) => m.user.id));
  const candidates = manage
    ? await prisma.user.findMany({
        where: { deletedAt: null, status: "Active", id: { notIn: [...memberIds] } },
        select: { id: true, name: true, designation: true },
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <div>
      <PageHeader
        title={committee.name}
        description={committee.description ?? undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="purple">{committee.type}</Badge>
            {manage ? (
              <>
                <EditCommitteeDialog
                  committee={{
                    id: committee.id,
                    name: committee.name,
                    type: committee.type,
                    description: committee.description,
                  }}
                />
                <ActionForm action={deleteCommittee} successToast="Committee deleted" className="!space-y-0">
                  <input type="hidden" name="id" value={id} />
                  <ConfirmSubmit confirmLabel="Delete Committee" className="btn-secondary text-red-600 hover:bg-red-50 hover:text-red-700">
                    Delete
                  </ConfirmSubmit>
                </ActionForm>
              </>
            ) : null}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CommitteeMembersManager
            committeeId={id}
            members={committee.members}
            candidates={candidates}
            manage={manage}
          />
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-title">Committee meetings ({committee.meetings.length})</h2>
            {manage ? (
              <Link
                href={`/meetings/new?committeeId=${committee.id}`}
                className="btn-secondary btn-sm inline-flex items-center gap-1"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
                Schedule Meeting
              </Link>
            ) : null}
          </div>

          {committee.meetings.length === 0 ? (
            <p className="text-sm text-slate-400">
              No meetings scheduled yet. Create one from the Meetings page or using the button above.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {committee.meetings.map((m) => (
                <li key={m.id} className="flex items-center justify-between py-2.5">
                  <Link
                    href={`/meetings/${m.id}`}
                    className="text-sm font-medium text-slate-800 hover:text-brand-700 transition"
                  >
                    {m.title}
                  </Link>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{fmtDateTime(m.scheduledAt)}</span>
                    <StatusBadge status={m.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
