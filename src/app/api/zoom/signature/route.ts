import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { checkCommitteeAccess } from "@/lib/rbac";
import { canAlwaysJoinCall } from "@/lib/meetingAccess";
import { generateMeetingSdkSignature } from "@/lib/zoomSdk";

export const dynamic = "force-dynamic";

/**
 * Mints a Zoom Meeting SDK signature for the embedded call in the meeting room.
 *
 * The client sends *our* meeting id, never a Zoom meeting number — the number
 * and passcode are read from the database after the same access check the room
 * page performs. That's the security boundary: without it, anyone with a session
 * could have us sign a join credential for an arbitrary Zoom meeting.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  let meetingId: number;
  try {
    const body = (await request.json()) as { meetingId?: unknown };
    meetingId = Number(body.meetingId);
  } catch {
    return new NextResponse("Invalid body", { status: 400 });
  }
  if (!Number.isInteger(meetingId)) return new NextResponse("Invalid meeting id", { status: 400 });

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { id: true, mode: true, type: true, committeeId: true, deletedAt: true, zoomMeetingId: true, zoomPasscode: true },
  });
  if (!meeting || meeting.deletedAt) return new NextResponse("Not Found", { status: 404 });

  // Same gate as src/app/(app)/meetings/[id]/room/page.tsx.
  if (!(await checkCommitteeAccess(user, meeting))) return new NextResponse("Forbidden", { status: 403 });
  if (!canAlwaysJoinCall(user)) {
    const attendee = await prisma.attendance.findUnique({
      where: { meetingId_userId: { meetingId: meeting.id, userId: user.id } },
    });
    if (!attendee) return new NextResponse("Forbidden", { status: 403 });
  }

  if (meeting.mode === "Physical" || !meeting.zoomMeetingId) {
    return new NextResponse("Meeting has no Zoom call", { status: 409 });
  }

  // Everyone joins as a participant — the Zoom meeting is created with
  // join_before_host, so no host (and therefore no ZAK token) is required.
  const signature = await generateMeetingSdkSignature({ meetingNumber: meeting.zoomMeetingId });
  if (!signature) return new NextResponse("Zoom Meeting SDK is not configured", { status: 503 });

  return NextResponse.json({
    signature,
    meetingNumber: meeting.zoomMeetingId,
    passcode: meeting.zoomPasscode ?? "",
    userName: user.name,
    userEmail: user.email,
  });
}
