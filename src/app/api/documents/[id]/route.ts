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
  const doc = await prisma.document.findUnique({
    where: { id },
    include: { boardPackSections: { select: { restrictedToUserId: true } } },
  });
  if (!doc || doc.deletedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const elevated = ["CompanySecretary", "CFO", "Chairman", "ManagingDirector"].includes(user.role);

  // Section-level restriction (e.g. presenter-only papers).
  const restrictions = doc.boardPackSections.map((s) => s.restrictedToUserId).filter((v): v is number => v != null);
  if (restrictions.length > 0 && !elevated && !restrictions.includes(user.id)) {
    return NextResponse.json({ error: "Restricted document" }, { status: 403 });
  }
  // Confidential documents are limited to directors + secretariat.
  if (doc.classification === "Confidential" && !elevated && !user.isDirector) {
    return NextResponse.json({ error: "Confidential" }, { status: 403 });
  }

  let bytes: Buffer;
  try {
    bytes = await readFile(doc.storageKey);
  } catch {
    return NextResponse.json({ error: "File missing from storage" }, { status: 410 });
  }

  await audit({ actorId: user.id, action: "download", entityType: "Document", entityId: doc.id, meetingId: doc.meetingId, summary: `Viewed "${doc.title}"` });

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": doc.mimeType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${encodeURIComponent(doc.fileName)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
