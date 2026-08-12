import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { PageHeader, Card, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function BoardPackViewer({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const id = Number(params.id);
  const pack = await prisma.boardPack.findUnique({ where: { id }, include: { meeting: { select: { id: true, title: true } } } });
  if (!pack) notFound();
  if (!pack.compiledPdfKey) redirect(`/meetings/${pack.meetingId}/board-pack`);

  // Access mirrors the board-pack download route: presenters never get the full pack.
  let allowed = ["CompanySecretary", "CFO", "Chairman", "ManagingDirector", "BoardMember"].includes(user.role);
  if (!allowed) {
    const att = await prisma.attendance.findUnique({ where: { meetingId_userId: { meetingId: pack.meetingId, userId: user.id } } });
    allowed = Boolean(att) && user.role !== "Management";
  }
  if (!allowed) redirect("/403");

  return (
    <div>
      <PageHeader
        title={`${pack.meeting.title} — Board Pack v${pack.version}`}
        description={pack.publishedAt ? `Published ${fmtDateTime(pack.publishedAt)}` : "Draft preview"}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={pack.status === "Published" ? "green" : "gray"}>{pack.status}</Badge>
            <Link href={`/meetings/${pack.meetingId}/board-pack`} className="btn-secondary">Back to pack</Link>
          </div>
        }
      />
      <Card className="p-2">
        <iframe src={`/api/board-packs/${id}#toolbar=0&navpanes=0&view=FitH`} className="h-[82vh] w-full rounded-lg border-0" title="Board pack" />
      </Card>
    </div>
  );
}
