import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readFile } from "@/lib/storage";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const id = Number(params.id);
  const pack = await prisma.boardPack.findUnique({ where: { id } });
  if (!pack || !pack.compiledPdfKey) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Presenters (Management) only get their assigned section via the document route,
  // never the full compiled pack.
  let allowed = ["CompanySecretary", "CFO", "Chairman", "ManagingDirector", "BoardMember"].includes(user.role);
  if (!allowed) {
    const attendee = await prisma.attendance.findUnique({ where: { meetingId_userId: { meetingId: pack.meetingId, userId: user.id } } });
    allowed = Boolean(attendee) && user.role !== "Management";
  }
  if (!allowed) return NextResponse.json({ error: "Not permitted to view the full board pack" }, { status: 403 });

  let bytes: Buffer;
  try {
    bytes = await readFile(pack.compiledPdfKey);
  } catch {
    return NextResponse.json({ error: "Compiled pack missing" }, { status: 410 });
  }

  await audit({ actorId: user.id, action: "download", entityType: "BoardPack", entityId: pack.id, meetingId: pack.meetingId, summary: `Viewed board pack v${pack.version}` });

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="board-pack-v${pack.version}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
