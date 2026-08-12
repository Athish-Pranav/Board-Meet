import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { PageHeader, Card, Field, Badge } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { addAnnotation, deleteAnnotation } from "./actions";

export const dynamic = "force-dynamic";

const COLORS = ["#ffeb3b", "#aef0c0", "#ffd0d0", "#cfe0ff"];

export default async function AnnotatePage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const id = Number(params.id);
  const doc = await prisma.document.findUnique({
    where: { id },
    include: { boardPackSections: { select: { restrictedToUserId: true } } },
  });
  if (!doc || doc.deletedAt) notFound();

  // Access check mirrors the download route.
  const elevated = ["CompanySecretary", "CFO", "Chairman", "ManagingDirector"].includes(user.role);
  const restrictions = doc.boardPackSections.map((s) => s.restrictedToUserId).filter((v): v is number => v != null);
  if (restrictions.length > 0 && !elevated && !restrictions.includes(user.id)) redirect("/403");
  if (doc.classification === "Confidential" && !elevated && !user.isDirector) redirect("/403");

  const annotations = await prisma.annotation.findMany({
    where: { documentId: id, userId: user.id },
    orderBy: [{ page: "asc" }, { createdAt: "asc" }],
  });

  const isPdf = doc.mimeType === "application/pdf" || doc.fileName.toLowerCase().endsWith(".pdf");

  return (
    <div>
      <PageHeader title={doc.title} description={`Reading & annotation · ${doc.fileName}`} actions={<Badge tone={doc.classification === "Confidential" ? "red" : "gray"}>{doc.classification}</Badge>} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card className="p-2">
            {isPdf ? (
              <iframe src={`/api/documents/${id}#toolbar=0&navpanes=0&view=FitH`} className="h-[78vh] w-full rounded-lg" title={doc.title} />
            ) : (
              <div className="flex h-[40vh] flex-col items-center justify-center gap-2 text-center">
                <p className="text-sm text-slate-500">Inline preview is available for PDFs.</p>
                <a href={`/documents/${id}/view`} className="btn-primary">Open document</a>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <h2 className="section-title mb-3">Add a highlight / note</h2>
            <ActionForm action={addAnnotation} submitLabel="Save annotation">
              <input type="hidden" name="documentId" value={id} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Page"><input type="number" name="page" min={1} defaultValue={1} className="input" /></Field>
                <Field label="Colour">
                  <select name="color" className="input" defaultValue={COLORS[0]}>
                    {COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Highlighted passage"><textarea name="quoted" rows={2} className="input" placeholder="Paste the text you're highlighting…" /></Field>
              <Field label="Your note"><textarea name="note" rows={2} className="input" /></Field>
            </ActionForm>
          </Card>

          <Card>
            <h2 className="section-title mb-3">My annotations</h2>
            {annotations.length === 0 ? (
              <p className="text-sm text-slate-400">No annotations yet. These are private to you.</p>
            ) : (
              <ul className="space-y-2">
                {annotations.map((a) => {
                  let quoted = "";
                  try { quoted = (JSON.parse(a.rectsJson) as { quoted?: string }).quoted ?? ""; } catch {}
                  return (
                    <li key={a.id} className="rounded-lg border border-slate-100 p-3" style={{ borderLeft: `4px solid ${a.color}` }}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-500">Page {a.page}</span>
                        <ActionForm action={deleteAnnotation} className="!space-y-0">
                          <input type="hidden" name="id" value={a.id} />
                          <input type="hidden" name="documentId" value={id} />
                          <button className="text-xs text-red-500 hover:underline">Delete</button>
                        </ActionForm>
                      </div>
                      {quoted ? <p className="mt-1 text-sm italic text-slate-600">“{quoted}”</p> : null}
                      {a.note ? <p className="mt-1 text-sm text-slate-700">{a.note}</p> : null}
                      <p className="mt-1 text-xs text-slate-400">{fmtDateTime(a.createdAt)}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
