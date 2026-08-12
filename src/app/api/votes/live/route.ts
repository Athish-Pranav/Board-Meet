import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Lightweight poll target for the live-voting popup. Returns every "For Approval"
// agenda item currently open for voting, plus this user's current choice.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ canVote: false, items: [] });

  const rows = await prisma.agendaItem.findMany({
    where: {
      deletedAt: null,
      classification: "ForApproval",
      votingStatus: "Circulated",
      meeting: { deletedAt: null },
    },
    select: {
      id: true,
      title: true,
      majorityRule: true,
      meeting: { select: { id: true, title: true } },
      votes: { where: { userId: user.id }, select: { choice: true } },
    },
    orderBy: { circulatedAt: "desc" },
    take: 20,
  });

  const items = rows.map((r) => ({
    itemId: r.id,
    meetingId: r.meeting.id,
    title: r.title,
    meetingTitle: r.meeting.title,
    majorityRule: r.majorityRule,
    myChoice: r.votes[0]?.choice ?? null,
  }));

  // Non-voting roles (e.g. Management) still see that a vote is under way, but
  // get a link to the agenda instead of vote buttons.
  return NextResponse.json({ canVote: can(user.role, "vote"), items });
}
