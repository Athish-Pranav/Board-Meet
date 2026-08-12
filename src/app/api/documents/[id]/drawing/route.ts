import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type Stroke = { color: string; width: number; points: { x: number; y: number }[] };
const MAX_STROKES = 400;

/** Same access check as GET /api/documents/[id] — never grant markup access to someone who can't view the file. */
async function checkAccess(userId: number, role: string, isDirector: boolean, documentId: number) {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: { boardPackSections: { select: { restrictedToUserId: true } } },
  });
  if (!doc || doc.deletedAt) return { ok: false as const };
  const elevated = ["CompanySecretary", "CFO", "Chairman", "ManagingDirector"].includes(role);
  const restrictions = doc.boardPackSections.map((s) => s.restrictedToUserId).filter((v): v is number => v != null);
  if (restrictions.length > 0 && !elevated && !restrictions.includes(userId)) return { ok: false as const };
  if (doc.classification === "Confidential" && !elevated && !isDirector) return { ok: false as const };
  return { ok: true as const };
}

/**
 * Private, per-user freehand drawing/highlighting on an individual agenda
 * document — distinct from the board pack's shared live markup (this is
 * never visible to anyone but its author) and from the older
 * quote-and-text-note Annotation model. One row per (document, user);
 * loaded once on open and overwritten wholesale on save, since there's no
 * other viewer to stay in sync with.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const documentId = Number(params.id);
  if (!Number.isInteger(documentId)) return new NextResponse("Invalid id", { status: 400 });

  const access = await checkAccess(user.id, user.role, user.isDirector, documentId);
  if (!access.ok) return new NextResponse("Forbidden", { status: 403 });

  const row = await prisma.documentDrawing.findUnique({
    where: { documentId_userId: { documentId, userId: user.id } },
    select: { strokesJson: true },
  });
  let strokes: Stroke[] = [];
  try {
    strokes = row ? (JSON.parse(row.strokesJson) as Stroke[]) : [];
  } catch {
    strokes = [];
  }
  return NextResponse.json({ strokes });
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const documentId = Number(params.id);
  if (!Number.isInteger(documentId)) return new NextResponse("Invalid id", { status: 400 });

  const access = await checkAccess(user.id, user.role, user.isDirector, documentId);
  if (!access.ok) return new NextResponse("Forbidden", { status: 403 });

  let strokes: Stroke[];
  try {
    const body = (await req.json()) as { strokes?: unknown };
    if (!Array.isArray(body.strokes)) return new NextResponse("Invalid body", { status: 400 });
    // Never trust client-supplied styling/point counts wholesale.
    strokes = body.strokes.slice(0, MAX_STROKES).map((s) => {
      const stroke = s as Partial<Stroke>;
      return {
        color: typeof stroke.color === "string" ? stroke.color.slice(0, 20) : "#e11d48",
        width: 3,
        points: Array.isArray(stroke.points) ? stroke.points.slice(0, 2000).map((p) => ({ x: Number(p.x) || 0, y: Number(p.y) || 0 })) : [],
      };
    });
  } catch {
    return new NextResponse("Invalid body", { status: 400 });
  }

  const strokesJson = JSON.stringify(strokes);
  if (strokes.length === 0) {
    await prisma.documentDrawing.deleteMany({ where: { documentId, userId: user.id } });
  } else {
    await prisma.documentDrawing.upsert({
      where: { documentId_userId: { documentId, userId: user.id } },
      create: { documentId, userId: user.id, strokesJson },
      update: { strokesJson },
    });
  }
  return NextResponse.json({ strokes });
}
