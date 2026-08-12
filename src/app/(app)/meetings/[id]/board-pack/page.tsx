import { notFound } from "next/navigation";
import { requireUser, can, assertCommitteeAccess } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { fmtDateTime, fmtBytes, cn } from "@/lib/format";
import { PageHeader, Card, Badge, StatusBadge, Field } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { DOC_CLASSIFICATIONS } from "@/lib/enums";
import { MeetingTabs } from "../MeetingTabs";
import { addSection, replaceSectionDocument, revertSectionDocument, removeSection, compilePack, publishPack } from "./actions";

export const dynamic = "force-dynamic";

export default async function BoardPackPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const id = Number(params.id);
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      mode: true,
      deletedAt: true,
      type: true,
      committeeId: true,
    },
  });
  if (!meeting || meeting.deletedAt) notFound();
  await assertCommitteeAccess(user, meeting);

  const canPublish = can(user.role, "boardpack.publish");

  const [packs, agendaItems, people, allDocs] = await Promise.all([
    prisma.boardPack.findMany({
      where: { meetingId: id },
      orderBy: { version: "desc" },
      include: {
        sections: {
          include: {
            agendaItem: { select: { sequence: true } },
            document: { select: { id: true, version: true, fileName: true, sizeBytes: true, classification: true } },
            restrictedToUser: { select: { name: true } },
          },
          orderBy: { sequence: "asc" },
        },
      },
    }),
    prisma.agendaItem.findMany({ where: { meetingId: id, deletedAt: null }, orderBy: { sequence: "asc" }, select: { id: true, sequence: true, title: true } }),
    prisma.user.findMany({ where: { deletedAt: null, status: "Active" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.document.findMany({
      where: { meetingId: id, deletedAt: null },
      select: {
        id: true,
        version: true,
        fileName: true,
        sizeBytes: true,
        uploadedAt: true,
        supersedesId: true,
        uploadedBy: { select: { name: true } },
      },
    }),
  ]);

  const docsById = new Map(allDocs.map((d) => [d.id, d]));
  const rootIdMap = new Map<number, number>();

  function getRootId(docId: number): number {
    if (rootIdMap.has(docId)) return rootIdMap.get(docId)!;
    const doc = docsById.get(docId);
    if (!doc || !doc.supersedesId) {
      rootIdMap.set(docId, docId);
      return docId;
    }
    const rId = getRootId(doc.supersedesId);
    rootIdMap.set(docId, rId);
    return rId;
  }

  const groupsByRoot = new Map<number, typeof allDocs>();
  for (const doc of allDocs) {
    const rId = getRootId(doc.id);
    const list = groupsByRoot.get(rId) ?? [];
    list.push(doc);
    groupsByRoot.set(rId, list);
  }

  const draft = packs.find((p) => p.status === "Draft");
  const published = packs.filter((p) => p.status === "Published");

  return (
    <div>
      <PageHeader title={meeting.title} description="Board pack" />
      <MeetingTabs id={id} mode={meeting.mode} />

      {/* Published packs (everyone allowed sees download link) */}
      {published.length > 0 ? (
        <Card className="mb-5">
          <h2 className="section-title mb-3">Published</h2>
          <ul className="space-y-2">
            {published.map((p) => (
              <li key={p.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-3">
                <div>
                  <p className="font-medium text-slate-800">Board pack v{p.version}</p>
                  <p className="text-xs text-slate-400">Published {fmtDateTime(p.publishedAt)} · {p.sections.length} sections</p>
                </div>
                <a href={`/board-packs/${p.id}/view`} className="btn-primary btn-sm">Open PDF</a>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {!canPublish ? (
        published.length === 0 ? (
          <p className="text-sm text-slate-400">The board pack has not been published yet. You will be notified when it is available.</p>
        ) : null
      ) : (
        <>
          <Card className="mb-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="section-title">Draft pack {draft ? `v${draft.version}` : ""}</h2>
              <div className="flex items-center gap-2">
                {draft?.compiledPdfKey ? <a href={`/board-packs/${draft.id}/view`} className="btn-secondary btn-sm">Preview PDF</a> : null}
                {draft && draft.sections.length > 0 ? (
                  <ActionForm action={compilePack} submitLabel="Compile PDF" submitVariant="secondary" className="!space-y-0">
                    <input type="hidden" name="meetingId" value={id} />
                  </ActionForm>
                ) : null}
                {draft?.compiledPdfKey ? (
                  <ActionForm action={publishPack} submitLabel="Publish" className="!space-y-0">
                    <input type="hidden" name="meetingId" value={id} />
                  </ActionForm>
                ) : null}
              </div>
            </div>

            {!draft || draft.sections.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">No sections yet. Add board papers below, then compile and publish.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {draft.sections
                  .slice()
                  .sort((a, b) => (a.agendaItem?.sequence ?? 999) - (b.agendaItem?.sequence ?? 999) || a.sequence - b.sequence)
                  .map((s, i) => {
                  const rId = s.documentId ? getRootId(s.documentId) : null;
                  const history = rId ? (groupsByRoot.get(rId) ?? []).sort((a, b) => b.version - a.version) : [];
                  return (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-slate-400">{i + 1}.</span>
                          <span className="font-medium text-slate-800">{s.title}</span>
                          {s.document ? <Badge tone="gray">v{s.document.version}</Badge> : null}
                          {s.document ? <Badge tone="blue">{s.document.classification}</Badge> : null}
                          {s.restrictedToUser ? <Badge tone="purple">Only {s.restrictedToUser.name}</Badge> : null}
                        </div>
                        <p className="text-xs text-slate-400">
                          {s.document ? `${s.document.fileName} · ${fmtBytes(s.document.sizeBytes)}` : "No document"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {s.document ? <a href={`/documents/${s.document.id}/view`} className="btn-secondary btn-sm">View</a> : null}
                        <details className="relative">
                          <summary className="btn-secondary btn-sm cursor-pointer list-none">Replace</summary>
                          <div className="absolute right-0 z-10 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
                            <ActionForm action={replaceSectionDocument} submitLabel="Upload new version" submitVariant="secondary">
                              <input type="hidden" name="meetingId" value={id} />
                              <input type="hidden" name="sectionId" value={s.id} />
                              <input type="file" name="file" className="text-xs" required />
                            </ActionForm>
                          </div>
                        </details>
                        {history.length > 1 ? (
                          <details className="relative">
                            <summary className="btn-secondary btn-sm cursor-pointer list-none">Versions</summary>
                            <div className="absolute right-0 z-10 mt-1 w-80 rounded-lg border border-slate-200 bg-white p-3 shadow-lg max-h-60 overflow-y-auto">
                              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Version History</h4>
                              <ul className="divide-y divide-slate-100 text-xs">
                                {history.map((doc) => {
                                  const isActive = doc.id === s.documentId;
                                  return (
                                    <li key={doc.id} className="py-2 flex flex-col gap-1">
                                      <div className="flex items-center justify-between">
                                        <span className={cn("font-medium", isActive ? "text-brand-700 font-semibold" : "text-slate-700")}>
                                          Version {doc.version} {isActive && "(Active)"}
                                        </span>
                                        <a href={`/documents/${doc.id}/view`} className="text-brand-600 hover:underline">Download</a>
                                      </div>
                                      <p className="text-[10px] text-slate-400">
                                        Uploaded by {doc.uploadedBy?.name || "Unknown"} on {fmtDateTime(doc.uploadedAt)}
                                      </p>
                                      {!isActive ? (
                                        <ActionForm action={revertSectionDocument} submitLabel={`Revert to v${doc.version}`} submitVariant="secondary" className="mt-1 !space-y-0 text-[10px]">
                                          <input type="hidden" name="meetingId" value={id} />
                                          <input type="hidden" name="sectionId" value={s.id} />
                                          <input type="hidden" name="documentId" value={doc.id} />
                                        </ActionForm>
                                      ) : null}
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          </details>
                        ) : null}
                        <ActionForm action={removeSection} successToast="Section removed" className="!space-y-0">
                          <input type="hidden" name="meetingId" value={id} />
                          <input type="hidden" name="sectionId" value={s.id} />
                          <ConfirmSubmit>Remove</ConfirmSubmit>
                        </ActionForm>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card className="max-w-2xl">
            <h2 className="section-title mb-3">Add board paper</h2>
            <ActionForm action={addSection} submitLabel="Add to pack">
              <input type="hidden" name="meetingId" value={id} />
              <Field label="Document" required hint="PDFs merge into the pack; images embed; other types are referenced.">
                <input type="file" name="file" className="block w-full text-sm" required />
              </Field>
              <Field label="Section title"><input name="title" className="input" placeholder="Defaults to the file name" /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Agenda item">
                  <select name="agendaItemId" className="input" defaultValue="">
                    <option value="">General (no item)</option>
                    {agendaItems.map((a) => <option key={a.id} value={a.id}>{a.sequence}. {a.title}</option>)}
                  </select>
                </Field>
                <Field label="Classification">
                  <select name="classification" className="input" defaultValue="Internal">
                    {DOC_CLASSIFICATIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Restrict to (presenter-only)" hint="If set, only this person (and the secretariat) can open this paper.">
                <select name="restrictedToUserId" className="input" defaultValue="">
                  <option value="">Visible to all members</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
            </ActionForm>
          </Card>
        </>
      )}
    </div>
  );
}
