import { requireUser } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { fmtRelative } from "@/lib/format";
import { ANNOUNCEMENT_CATEGORIES, ANNOUNCEMENT_CATEGORY_LABELS, type AnnouncementCategory } from "@/lib/enums";
import { PageHeader, Card, Badge, Field, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { createAnnouncement, deleteAnnouncement } from "./actions";
import { canPostNews } from "@/lib/news";

export const dynamic = "force-dynamic";

export default async function NewsPage() {
  const user = await requireUser();
  const canPost = canPostNews(user.role);

  const [announcements, docs] = await Promise.all([
    prisma.announcement.findMany({
      where: { deletedAt: null },
      include: { createdBy: { select: { name: true } }, document: { select: { id: true, title: true } } },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    }),
    canPost ? prisma.document.findMany({ where: { deletedAt: null, folderId: { not: null } }, select: { id: true, title: true }, orderBy: { uploadedAt: "desc" }, take: 100 }) : Promise.resolve([]),
  ]);

  return (
    <div>
      <PageHeader title="News & Shared Documents" description="Latest news and shared information for the board." />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {announcements.length === 0 ? (
            <EmptyState title="Nothing posted yet" hint="News and shared documents will appear here." />
          ) : (
            announcements.map((a) => (
              <Card key={a.id} className={a.pinned ? "border-brand-200" : ""}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {a.pinned ? <Icon name="flag" className="h-4 w-4 text-brand-600" /> : null}
                      <h2 className="font-semibold text-slate-800">{a.title}</h2>
                      <Badge tone={a.category === "SharedDoc" ? "purple" : "blue"}>{ANNOUNCEMENT_CATEGORY_LABELS[a.category as AnnouncementCategory] ?? a.category}</Badge>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{a.body}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      <span>{a.createdBy.name} · {fmtRelative(a.createdAt)}</span>
                      {a.document ? <a href={`/documents/${a.document.id}/view`} className="text-brand-600 hover:underline">Open: {a.document.title}</a> : null}
                      {a.linkUrl ? <a href={a.linkUrl} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">Link</a> : null}
                    </div>
                  </div>
                  {canPost ? (
                    <ActionForm action={deleteAnnouncement} successToast="Removed" className="!space-y-0">
                      <input type="hidden" name="id" value={a.id} />
                      <ConfirmSubmit>Remove</ConfirmSubmit>
                    </ActionForm>
                  ) : null}
                </div>
              </Card>
            ))
          )}
        </div>

        {canPost ? (
          <Card className="h-fit">
            <h2 className="section-title mb-3">Post an update</h2>
            <ActionForm action={createAnnouncement} submitLabel="Post">
              <Field label="Title" required><input name="title" className="input" required /></Field>
              <Field label="Message" required><textarea name="body" rows={3} className="input" required /></Field>
              <Field label="Category">
                <select name="category" className="input" defaultValue="News">
                  {ANNOUNCEMENT_CATEGORIES.map((c) => <option key={c} value={c}>{ANNOUNCEMENT_CATEGORY_LABELS[c]}</option>)}
                </select>
              </Field>
              <Field label="Attach a repository document">
                <select name="documentId" className="input" defaultValue="">
                  <option value="">None</option>
                  {docs.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
                </select>
              </Field>
              <Field label="External link"><input name="linkUrl" className="input" placeholder="https://…" /></Field>
              <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" name="pinned" className="rounded border-slate-300" /> Pin to top</label>
              <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" name="notify" className="rounded border-slate-300" /> Also notify all members</label>
            </ActionForm>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
