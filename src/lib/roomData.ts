import "server-only";
import { notFound, redirect } from "next/navigation";
import { prisma } from "./db";
import { can, assertCommitteeAccess } from "./rbac";
import { canAlwaysJoinCall } from "./meetingAccess";
import { env } from "./env";
import type { SessionUser } from "./auth";
import type { AgendaNode, PackLite, VotingLite } from "@/components/call/RoomTabs";

/**
 * Everything the meeting room needs — agenda tree, board pack, voting state,
 * and the access/embed flags that drive its banners. Shared by the room page
 * and the in-call side panel (see CallSidePanel) so the queries and access
 * rules can't drift between the two: change it once here.
 */
export async function loadRoomData(user: SessionUser, id: number) {
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: { id: true, title: true, mode: true, meetingLink: true, zoomMeetingId: true, deletedAt: true, status: true, type: true, committeeId: true, quorumRequired: true },
  });
  if (!meeting || meeting.deletedAt) notFound();
  await assertCommitteeAccess(user, meeting);

  // Access: board members/directors, the secretariat/chair/leadership, or an invited attendee.
  const elevated = ["CompanySecretary", "CFO", "Chairman", "ManagingDirector"].includes(user.role);
  if (!canAlwaysJoinCall(user)) {
    const attendee = await prisma.attendance.findUnique({ where: { meetingId_userId: { meetingId: id, userId: user.id } } });
    if (!attendee) redirect("/403");
  }
  const canSeeConfidential = elevated || user.isDirector;

  // The resolutions panel is restricted to the secretariat (CompanySecretary /
  // CFO). Directors still vote — through the live-voting prompt that appears
  // on any page the moment a resolution is circulated — but the running tally
  // and the per-director vote record are not shown to them here. The query is
  // skipped entirely rather than merely hidden in the UI: those rows say who
  // voted which way, and must not reach a browser that may not display them.
  const canManageVote = can(user.role, "resolutions.manage");
  // Independent of canManageVote/voting above: directors can vote without
  // ever being able to see the tally or resolution list.
  const canVote = can(user.role, "vote");

  const [items, pack, resolutionItems, totalVoters, myNotes] = await Promise.all([
    prisma.agendaItem.findMany({
      where: { meetingId: id, deletedAt: null },
      orderBy: { sequence: "asc" },
      select: {
        id: true, parentId: true, title: true, description: true, classification: true,
        presenter: { select: { name: true } },
        documents: { where: { deletedAt: null }, select: { id: true, fileName: true, mimeType: true, classification: true } },
      },
    }),
    prisma.boardPack.findFirst({ where: { meetingId: id }, orderBy: { version: "desc" }, select: { id: true, version: true, status: true, compiledPdfKey: true } }),
    canManageVote
      ? prisma.agendaItem.findMany({
          where: { meetingId: id, deletedAt: null, classification: "ForApproval" },
          orderBy: { sequence: "asc" },
          select: {
            id: true,
            title: true,
            majorityRule: true,
            votingStatus: true,
            votes: { include: { user: { select: { name: true } } }, orderBy: { votedAt: "asc" } },
          },
        })
      : Promise.resolve([]),
    prisma.user.count({ where: { status: "Active", deletedAt: null } }),
    // Queried through the relation (meeting -> item) rather than needing this
    // meeting's item ids up front — those come from the `items` query above,
    // which runs concurrently in this same Promise.all and isn't resolved yet.
    prisma.agendaNote.findMany({
      where: { userId: user.id, agendaItem: { meetingId: id, deletedAt: null } },
      select: { agendaItemId: true, content: true },
    }),
  ]);

  const noteByItem = new Map(myNotes.map((n) => [n.agendaItemId, n.content]));
  const visible = (docs: { classification: string }[]) => docs.filter((d) => d.classification !== "Confidential" || canSeeConfidential);
  const childrenBy = new Map<number, typeof items>();
  for (const it of items) if (it.parentId != null) { const l = childrenBy.get(it.parentId) ?? []; l.push(it); childrenBy.set(it.parentId, l); }
  const toNode = (it: (typeof items)[number]): AgendaNode => ({
    id: it.id, title: it.title, description: it.description, classification: it.classification,
    presenter: it.presenter, documents: visible(it.documents) as AgendaNode["documents"],
    note: noteByItem.get(it.id) ?? null,
    children: (childrenBy.get(it.id) ?? []).map(toNode),
  });
  const agenda = items.filter((it) => it.parentId == null).map(toNode);

  const packLite: PackLite = pack ? { id: pack.id, version: pack.version, status: pack.status, ready: Boolean(pack.compiledPdfKey) } : null;

  // Embed the call only when there's a real Zoom meeting to join and the
  // Meeting SDK is configured; otherwise the room degrades to the join link.
  const embedCall = meeting.mode !== "Physical" && Boolean(meeting.zoomMeetingId) && env.zoom.sdkEnabled;

  const voting: VotingLite | null = canManageVote
    ? {
        userId: user.id,
        userName: user.name,
        totalVoters,
        canVote,
        canManageVote,
        resolutions: resolutionItems,
      }
    : null;

  // Joining the call — embedded or via the plain Zoom link — does NOT by
  // itself notify anyone. The "meeting in session" prompt (LiveMeetingNotifier)
  // is driven by meeting.status, which only changes via this explicit,
  // quorum-gated action.
  const canStartSession =
    canManageVote && meeting.mode !== "Physical" && Boolean(meeting.zoomMeetingId) && (meeting.status === "Scheduled" || meeting.status === "Draft");

  return { meeting, agenda, pack: packLite, voting, canManageVote, canVote, embedCall, canStartSession };
}
