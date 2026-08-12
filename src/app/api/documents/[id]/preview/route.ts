import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readFile } from "@/lib/storage";
import { docxToHtml, xlsxToHtml, pptxToHtml } from "@/lib/office-preview";

export const dynamic = "force-dynamic";

const OFFICE_MIME: Record<string, "docx" | "xlsx" | "pptx"> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/msword": "docx",
  "application/vnd.ms-excel": "xlsx",
  "application/vnd.ms-powerpoint": "pptx",
};

function typeFromName(name: string): "docx" | "xlsx" | "pptx" | null {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "docx" || ext === "doc") return "docx";
  if (ext === "xlsx" || ext === "xls") return "xlsx";
  if (ext === "pptx" || ext === "ppt") return "pptx";
  return null;
}

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
  const restrictions = doc.boardPackSections.map((s) => s.restrictedToUserId).filter((v): v is number => v != null);
  if (restrictions.length > 0 && !elevated && !restrictions.includes(user.id)) {
    return NextResponse.json({ error: "Restricted document" }, { status: 403 });
  }
  if (doc.classification === "Confidential" && !elevated && !user.isDirector) {
    return NextResponse.json({ error: "Confidential" }, { status: 403 });
  }

  const kind = OFFICE_MIME[doc.mimeType ?? ""] ?? typeFromName(doc.fileName);
  if (!kind) return NextResponse.json({ error: "Not an Office document" }, { status: 400 });

  let bytes: Buffer;
  try {
    bytes = await readFile(doc.storageKey);
  } catch {
    return NextResponse.json({ error: "File missing from storage" }, { status: 410 });
  }

  // office-preview's parsers (xlsx in particular — see its module comment)
  // run on attacker-reachable file content; cap what's handed to them well
  // below the general upload limit to shrink the exploitable surface.
  const PREVIEW_MAX_BYTES = 8 * 1024 * 1024;
  if (bytes.length > PREVIEW_MAX_BYTES) {
    return NextResponse.json({ error: "File too large to preview (8 MB limit) — download it instead." }, { status: 413 });
  }

  let html: string;
  try {
    if (kind === "docx") html = await docxToHtml(bytes);
    else if (kind === "xlsx") html = await xlsxToHtml(bytes);
    else html = await pptxToHtml(bytes);
  } catch (e) {
    console.error("Office preview conversion error:", e);
    return NextResponse.json({ error: "Failed to convert document for preview" }, { status: 500 });
  }

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}
