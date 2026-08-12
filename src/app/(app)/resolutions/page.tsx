import Link from "next/link";
import { requireUser } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { AGENDA_VOTING_STATUS_LABELS, type AgendaVotingStatus } from "@/lib/enums";
import { PageHeader, Table, Badge, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<AgendaVotingStatus, "green" | "red" | "amber" | "gray"> = {
  None: "gray",
  Circulated: "amber",
  Passed: "green",
  Failed: "red",
  Withdrawn: "gray",
};

// Resolutions are "For Approval" agenda items. This is a read-only register
// across meetings; voting happens on each meeting's agenda.
export default async function ResolutionsPage({ searchParams }: { searchParams: { meeting?: string } }) {
  await requireUser();
  const meetingId = searchParams.meeting ? Number(searchParams.meeting) : undefined;

  const items = await prisma.agendaItem.findMany({
    where: {
      deletedAt: null,
      classification: "ForApproval",
      meeting: { deletedAt: null },
      ...(meetingId ? { meetingId } : {}),
    },
    include: { meeting: { select: { id: true, title: true } }, _count: { select: { votes: true } } },
    orderBy: [{ meeting: { scheduledAt: "desc" } }, { sequence: "asc" }],
  });

  return (
    <div>
      <PageHeader title="Resolutions" description="Items put to the board for approval, with voting status and tally. Voting is recorded on each meeting's agenda." />

      {items.length === 0 ? (
        <EmptyState title="No resolutions" hint="Add a 'For Approval' item to a meeting's agenda to create a resolution." />
      ) : (
        <Table
          head={
            <>
              <th className="th">Resolution</th>
              <th className="th">Meeting</th>
              <th className="th">Majority</th>
              <th className="th">Votes</th>
              <th className="th">Status</th>
            </>
          }
        >
          {items.map((r) => {
            const status = r.votingStatus as AgendaVotingStatus;
            return (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="td">
                  <Link href={`/meetings/${r.meeting.id}/agenda`} className="font-medium text-slate-800 hover:text-brand-700">{r.title}</Link>
                </td>
                <td className="td">
                  <Link href={`/meetings/${r.meeting.id}`} className="text-slate-600 hover:text-brand-700">{r.meeting.title}</Link>
                </td>
                <td className="td">{r.majorityRule === "Special" ? "Special (≥75%)" : "Simple"}</td>
                <td className="td">{r._count.votes}</td>
                <td className="td"><Badge tone={STATUS_TONE[status]}>{AGENDA_VOTING_STATUS_LABELS[status]}</Badge></td>
              </tr>
            );
          })}
        </Table>
      )}
    </div>
  );
}
