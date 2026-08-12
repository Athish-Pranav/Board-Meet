import { requireUser, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { fmtDate, fmtBytes } from "@/lib/format";
import { DOC_CLASSIFICATIONS, FOLDER_CATEGORY_LABELS, type FolderCategory } from "@/lib/enums";
import { PageHeader, Card, Table, Badge, Field, EmptyState } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { createFolder, uploadRepositoryDocument, archiveDocument } from "./actions";

export const dynamic = "force-dynamic";

export default async function DocumentsPage({ searchParams }: { searchParams: { q?: string; folder?: string } }) {
  const user = await requireUser();
  const q = (searchParams.q ?? "").trim();
  const folderId = searchParams.folder ? Number(searchParams.folder) : undefined;
  const elevated = ["CompanySecretary", "CFO", "Chairman", "ManagingDirector"].includes(user.role);
  const manage = can(user.role, "documents.manage");

  const [folders, documents] = await Promise.all([
    prisma.folder.findMany({ include: { _count: { select: { documents: true } } }, orderBy: { name: "asc" } }),
    prisma.document.findMany({
      where: {
        deletedAt: null,
        folderId: folderId ?? { not: null }, // repository view = docs filed in a folder
        ...(q ? { title: { contains: q } } : {}),
        // Non-elevated members cannot see Confidential documents in listings.
        ...(elevated ? {} : { classification: { not: "Confidential" }, archivedAt: null }),
      },
      include: { folder: { select: { name: true } }, uploadedBy: { select: { name: true } } },
      orderBy: { uploadedAt: "desc" },
      take: 200,
    }),
  ]);

  return (
    <div>
      <PageHeader title="Document Repository" description="Governance documents, classified and searchable. Board papers stay with their meeting." />

      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Search documents…" className="input max-w-xs" />
        {folderId ? <input type="hidden" name="folder" value={folderId} /> : null}
        <button className="btn-secondary">Search</button>
        {(q || folderId) && <a href="/documents" className="btn-secondary">Clear</a>}
      </form>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {folders.map((f) => (
          <a
            key={f.id}
            href={`/documents?folder=${f.id}`}
            className={`card p-4 transition hover:border-brand-300 ${folderId === f.id ? "ring-2 ring-brand-300" : ""}`}
          >
            <p className="font-medium text-slate-800">{f.name}</p>
            <p className="text-xs text-slate-400">{FOLDER_CATEGORY_LABELS[f.category as FolderCategory] ?? f.category}</p>
            <p className="mt-2 text-2xl font-bold text-brand-600">{f._count.documents}</p>
          </a>
        ))}
      </div>

      {documents.length === 0 ? (
        <EmptyState title="No documents" hint={q ? "No documents match your search." : "Upload governance documents into a folder."} />
      ) : (
        <Table
          head={
            <>
              <th className="th">Title</th>
              <th className="th">Folder</th>
              <th className="th">Class</th>
              <th className="th">Size</th>
              <th className="th">Uploaded</th>
              <th className="th"></th>
            </>
          }
        >
          {documents.map((d) => (
            <tr key={d.id} className="hover:bg-slate-50">
              <td className="td">
                <a href={`/documents/${d.id}/view`} className="font-medium text-slate-800 hover:text-brand-700">{d.title}</a>
                {d.archivedAt ? <Badge tone="gray">Archived</Badge> : null}
              </td>
              <td className="td">{d.folder?.name ?? "—"}</td>
              <td className="td"><Badge tone={d.classification === "Confidential" ? "red" : d.classification === "Restricted" ? "amber" : "gray"}>{d.classification}</Badge></td>
              <td className="td">{fmtBytes(d.sizeBytes)}</td>
              <td className="td">{fmtDate(d.uploadedAt)}<div className="text-xs text-slate-400">{d.uploadedBy.name}</div></td>
              <td className="td">
                <div className="flex items-center gap-1">
                  <a href={`/documents/${d.id}/annotate`} className="btn-secondary btn-sm">Read</a>
                  {manage ? (
                    <ActionForm action={archiveDocument} className="!space-y-0">
                      <input type="hidden" name="docId" value={d.id} />
                      <button className="btn-secondary btn-sm">{d.archivedAt ? "Unarchive" : "Archive"}</button>
                    </ActionForm>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}

      {manage ? (
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <Card>
            <h2 className="section-title mb-3">Upload document</h2>
            <ActionForm action={uploadRepositoryDocument} submitLabel="Upload">
              <Field label="File" required><input type="file" name="file" className="block w-full text-sm" required /></Field>
              <Field label="Title"><input name="title" className="input" placeholder="Defaults to file name" /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Folder">
                  <select name="folderId" className="input" defaultValue={folderId ?? ""}>
                    <option value="">Unfiled</option>
                    {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </Field>
                <Field label="Classification">
                  <select name="classification" className="input" defaultValue="Internal">
                    {DOC_CLASSIFICATIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
              </div>
            </ActionForm>
          </Card>

          <Card>
            <h2 className="section-title mb-3">New folder</h2>
            <ActionForm action={createFolder} submitLabel="Create folder" submitVariant="secondary">
              <Field label="Name" required><input name="name" className="input" required /></Field>
              <Field label="Category">
                <select name="category" className="input" defaultValue="General">
                  {Object.entries(FOLDER_CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
            </ActionForm>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
