import Link from "next/link";
import { requireUser } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { MEETING_TYPES, MEETING_TYPE_LABELS, type MeetingType } from "@/lib/enums";
import { PageHeader, Table, StatusBadge, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function MinutesRepository({ searchParams }: { searchParams: { q?: string; type?: string; page?: string } }) {
  await requireUser();
  const q = (searchParams.q ?? "").trim();
  const type = MEETING_TYPES.includes(searchParams.type as MeetingType) ? searchParams.type : undefined;
  const page = Math.max(1, Number(searchParams.page) || 1);

  const where = {
    ...(q ? { content: { contains: q } } : {}),
    meeting: { deletedAt: null, ...(type ? { type } : {}) },
  };

  const [minutes, total] = await Promise.all([
    prisma.minutes.findMany({
      where,
      include: { meeting: { select: { id: true, title: true, type: true, scheduledAt: true } } },
      orderBy: { meeting: { scheduledAt: "desc" } },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.minutes.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (type) params.set("type", type);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/minutes?${qs}` : "/minutes";
  };

  return (
    <div>
      <PageHeader title="Minutes" description="Searchable minute book. Finalized minutes are permanent records (s.118)." />

      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Search within minutes…" className="input max-w-xs" />
        <select name="type" defaultValue={type ?? ""} className="input max-w-xs">
          <option value="">All meeting types</option>
          {MEETING_TYPES.map((t) => <option key={t} value={t}>{MEETING_TYPE_LABELS[t]}</option>)}
        </select>
        <button type="submit" className="btn-secondary">Search</button>
      </form>

      {minutes.length === 0 ? (
        <EmptyState title="No minutes found" hint={q ? "Try a different search term." : "Minutes appear here once meetings are concluded."} />
      ) : (
        <Table
          head={
            <>
              <th className="th">Meeting</th>
              <th className="th">Type</th>
              <th className="th">Date</th>
              <th className="th">Status</th>
            </>
          }
        >
          {minutes.map((m) => (
            <tr key={m.id} className="hover:bg-slate-50">
              <td className="td">
                <Link href={`/meetings/${m.meeting.id}/minutes`} className="font-medium text-slate-800 hover:text-brand-700">
                  {m.meeting.title}
                </Link>
              </td>
              <td className="td">{MEETING_TYPE_LABELS[m.meeting.type as MeetingType] ?? m.meeting.type}</td>
              <td className="td">{fmtDate(m.meeting.scheduledAt)}</td>
              <td className="td"><StatusBadge status={m.status} /></td>
            </tr>
          ))}
        </Table>
      )}

      {totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
          <span>
            Page {page} of {totalPages} ({total} total)
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={pageHref(page - 1)} className="btn-secondary">
                Previous
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link href={pageHref(page + 1)} className="btn-secondary">
                Next
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
