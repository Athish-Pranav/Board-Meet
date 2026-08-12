import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { checkCommitteeAccess } from "@/lib/rbac";
import { canAlwaysJoinCall } from "@/lib/meetingAccess";

export const dynamic = "force-dynamic";

const MAX_NOTE_LENGTH = 10000;

/**
 * Private per-user notes on an agenda item — one note per (item, user),
 * overwritten on each save. Never visible to anyone but the author; the
 * agenda's own queries (loadRoomData) never select another user's note.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const itemId = Number(params.id);
  if (!Number.isInteger(itemId)) return new NextResponse("Invalid id", { status: 400 });

  const item = await prisma.agendaItem.findUnique({
    where: { id: itemId },
    select: { id: true, deletedAt: true, meeting: { select: { id: true, type: true, committeeId: true } } },
  });
  if (!item || item.deletedAt) return new NextResponse("Not found", { status: 404 });

  // Same access rule as the room: elevated roles/directors always in, or an
  // invited attendee — never let someone jot notes on a meeting they can't see.
  if (!(await checkCommitteeAccess(user, item.meeting))) return new NextResponse("Forbidden", { status: 403 });
  if (!canAlwaysJoinCall(user)) {
    const attendee = await prisma.attendance.findUnique({
      where: { meetingId_userId: { meetingId: item.meeting.id, userId: user.id } },
    });
    if (!attendee) return new NextResponse("Forbidden", { status: 403 });
  }

  let content: string;
  try {
    const body = (await req.json()) as { content?: unknown };
    if (typeof body.content !== "string") return new NextResponse("Invalid body", { status: 400 });
    content = body.content.slice(0, MAX_NOTE_LENGTH);
  } catch {
    return new NextResponse("Invalid body", { status: 400 });
  }

  if (content.trim() === "") {
    // Saving an emptied-out note deletes the row rather than keeping a blank one.
    await prisma.agendaNote.deleteMany({ where: { agendaItemId: itemId, userId: user.id } });
    return NextResponse.json({ content: "" });
  }

  await prisma.agendaNote.upsert({
    where: { agendaItemId_userId: { agendaItemId: itemId, userId: user.id } },
    create: { agendaItemId: itemId, userId: user.id, content },
    update: { content },
  });

  return NextResponse.json({ content });
}
