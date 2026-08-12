import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader, Card } from "@/components/ui";
import { MeetingForm } from "../../MeetingForm";
import { updateMeeting } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditMeetingPage({ params }: { params: { id: string } }) {
  await requirePermission("meetings.edit");
  const id = Number(params.id);
  const [meeting, committees] = await Promise.all([
    prisma.meeting.findUnique({ where: { id } }),
    prisma.committee.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  if (!meeting || meeting.deletedAt) notFound();

  return (
    <div className="max-w-2xl">
      <PageHeader title="Edit meeting" actions={<Link href={`/meetings/${id}`} className="btn-secondary">Cancel</Link>} />
      <Card>
        <MeetingForm action={updateMeeting} committees={committees} meeting={meeting} submitLabel="Save changes" />
      </Card>
    </div>
  );
}
