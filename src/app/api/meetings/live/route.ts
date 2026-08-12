import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { checkCommitteeAccess } from "@/lib/rbac";
import { canAlwaysJoinCall } from "@/lib/meetingAccess";

export const dynamic = "force-dynamic";

/**
 * Meetings that are live right now and that the current user may join, so the
 * app can surface a "join the call" prompt from any page.
 *
 * "Live" means the secretariat has marked the meeting in session (which the
 * quorum check gates) AND it has a Zoom call attached. Zoom itself is not
 * consulted: reading who is actually in a Zoom meeting needs dashboard scopes
 * on a paid plan, whereas the in-session flag is already a deliberate act by
 * the chair/secretary and is the governance record of when the meeting began.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const meetings = await prisma.meeting.findMany({
    where: {
      deletedAt: null,
      status: "InSession",
      mode: { not: "Physical" },
      zoomMeetingId: { not: null },
    },
    select: { id: true, title: true, type: true, committeeId: true },
    orderBy: { startedAt: "desc" },
    take: 5,
  });
  if (meetings.length === 0) return NextResponse.json({ meetings: [] });

  // One lookup for the whole set rather than a query per meeting.
  const invited = canAlwaysJoinCall(user)
    ? null
    : new Set(
        (
          await prisma.attendance.findMany({
            where: { meetingId: { in: meetings.map((m) => m.id) }, userId: user.id },
            select: { meetingId: true },
          })
        ).map((a) => a.meetingId),
      );

  const visible = [];
  for (const m of meetings) {
    if (invited && !invited.has(m.id)) continue;
    if (!(await checkCommitteeAccess(user, m))) continue;
    visible.push({ id: m.id, title: m.title });
  }

  return NextResponse.json({ meetings: visible });
}
