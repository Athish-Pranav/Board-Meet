import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { fmtBytes, fmtDate } from "@/lib/format";
import { PageHeader, Card, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DocumentViewer({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const id = Number(params.id);
  const doc = await prisma.document.findUnique({
    where: { id },
    include: { boardPackSections: { select: { restrictedToUserId: true } }, uploadedBy: { select: { name: true } } },
  });
  if (!doc || doc.deletedAt) notFound();

  // Access check mirrors the download route.
  const elevated = ["CompanySecretary", "CFO", "Chairman", "ManagingDirector"].includes(user.role);
  const restrictions = doc.boardPackSections.map((s) => s.restrictedToUserId).filter((v): v is number => v != null);
  if (restrictions.length > 0 && !elevated && !restrictions.includes(user.id)) redirect("/403");
  if (doc.classification === "Confidential" && !elevated && !user.isDirector) redirect("/403");

  const isPdf = doc.mimeType === "application/pdf" || doc.fileName.toLowerCase().endsWith(".pdf");
  const isImage = (doc.mimeType ?? "").startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(doc.fileName);
  const isOffice = [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/msword",
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
  ].includes(doc.mimeType ?? "") || /\.(docx?|xlsx?|pptx?)$/i.test(doc.fileName);

  return (
    <div>
      <PageHeader
        title={doc.title}
        description={`${doc.fileName} · v${doc.version} · ${fmtBytes(doc.sizeBytes)} · ${fmtDate(doc.uploadedAt)} · ${doc.uploadedBy.name}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={doc.classification === "Confidential" ? "red" : doc.classification === "Restricted" ? "amber" : "gray"}>{doc.classification}</Badge>
            <Link href={`/documents/${id}/annotate`} className="btn-secondary">Annotate</Link>
          </div>
        }
      />

      <Card className="p-2">
        {isPdf ? (
          // toolbar=0 hides the browser PDF viewer's download / print controls.
          <iframe src={`/api/documents/${id}#toolbar=0&navpanes=0&view=FitH`} className="h-[82vh] w-full rounded-lg border-0" title={doc.title} />
        ) : isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/documents/${id}`} alt={doc.title} className="mx-auto max-h-[82vh] rounded-lg" />
        ) : isOffice ? (
          <iframe src={`/api/documents/${id}/preview`} className="h-[82vh] w-full rounded-lg border-0 bg-slate-50" title={doc.title} />
        ) : (
          <div className="flex h-[40vh] flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-slate-500">Inline preview is available for PDFs, images, and Office documents (Word, Excel, PowerPoint). This file is {doc.mimeType}.</p>
            <p className="text-xs text-slate-400">Downloading is disabled for this document.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
