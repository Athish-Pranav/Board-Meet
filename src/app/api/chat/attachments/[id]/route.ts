import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { membership } from "@/lib/chat";
import { readFile } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stream a chat attachment — only to members of that conversation.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const message = await prisma.chatMessage.findUnique({ where: { id: Number(params.id) } });
  if (!message || !message.attachmentKey) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await membership(message.conversationId, user.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let bytes: Buffer;
  try {
    bytes = await readFile(message.attachmentKey);
  } catch {
    return NextResponse.json({ error: "File missing" }, { status: 410 });
  }
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": message.attachmentType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${encodeURIComponent(message.attachmentName ?? "file")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
