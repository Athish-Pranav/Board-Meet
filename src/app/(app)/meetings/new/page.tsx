import Link from "next/link";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader, Card } from "@/components/ui";
import { MeetingForm } from "../MeetingForm";
import { createMeeting } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewMeetingPage() {
  await requirePermission("meetings.create");
  const committees = await prisma.committee.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } });

  return (
    <div className="max-w-2xl">
      <PageHeader title="Schedule a meeting" actions={<Link href="/meetings" className="btn-secondary">Cancel</Link>} />
      <Card>
        <p className="mb-4 text-sm text-slate-500">
          Directors (or committee members) are invited automatically and quorum is calculated per s.174. Issue formal notice
          from the meeting page — the system checks the 7-day minimum (s.173(3)).
        </p>
        <MeetingForm action={createMeeting} committees={committees} submitLabel="Schedule meeting" />
      </Card>
    </div>
  );
}
