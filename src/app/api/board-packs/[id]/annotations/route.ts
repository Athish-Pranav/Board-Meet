import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { getAnnotations, addStroke, clearAnnotations, type Stroke } from "@/lib/annotations";

export const dynamic = "force-dynamic";

/** Same viewing gate as GET /api/board-packs/[id] — never grant markup access to someone who can't see the pack. */
async function checkAccess(userId: number, role: string, boardPackId: number) {
  const pack = await prisma.boardPack.findUnique({ where: { id: boardPackId }, select: { meetingId: true } });
  if (!pack) return false;
  let allowed = ["CompanySecretary", "CFO", "Chairman", "ManagingDirector", "BoardMember"].includes(role);
  if (!allowed) {
    const attendee = await prisma.attendance.findUnique({ where: { meetingId_userId: { meetingId: pack.meetingId, userId } } });
    allowed = Boolean(attendee) && role !== "Management";
  }
  return allowed;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const boardPackId = Number(params.id);
  if (!(await checkAccess(user.id, user.role, boardPackId))) return new NextResponse("Forbidden", { status: 403 });
  return NextResponse.json(getAnnotations(boardPackId));
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const boardPackId = Number(params.id);
  if (!(await checkAccess(user.id, user.role, boardPackId))) return new NextResponse("Forbidden", { status: 403 });

  let stroke: Stroke;
  try {
    const body = (await req.json()) as { stroke?: Stroke };
    if (!body.stroke || !Array.isArray(body.stroke.points) || body.stroke.points.length < 2) {
      return new NextResponse("Invalid stroke", { status: 400 });
    }
    // Clamp to what the canvas actually draws with — never trust client-supplied styling.
    stroke = {
      color: typeof body.stroke.color === "string" ? body.stroke.color.slice(0, 20) : "#e11d48",
      width: 3,
      points: body.stroke.points.slice(0, 2000).map((p) => ({ x: Number(p.x) || 0, y: Number(p.y) || 0 })),
    };
  } catch {
    return new NextResponse("Invalid body", { status: 400 });
  }

  return NextResponse.json(addStroke(boardPackId, stroke));
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const boardPackId = Number(params.id);
  if (!(await checkAccess(user.id, user.role, boardPackId))) return new NextResponse("Forbidden", { status: 403 });
  // Clearing wipes everyone's markup at once — restrict to the secretariat,
  // same permission that already gates other room-wide admin actions.
  if (!can(user.role, "resolutions.manage")) return new NextResponse("Forbidden", { status: 403 });
  return NextResponse.json(clearAnnotations(boardPackId));
}
