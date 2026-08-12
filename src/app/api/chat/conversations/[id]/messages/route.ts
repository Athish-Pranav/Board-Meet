import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { membership } from "@/lib/chat";
import { saveFile } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 24 * 1024 * 1024;

function serialize(m: { id: number; senderId: number; sender: { name: string }; body: string | null; attachmentKey: string | null; attachmentName: string | null; attachmentType: string | null; attachmentSize: number | null; createdAt: Date }) {
  return {
    id: m.id,
    senderId: m.senderId,
    senderName: m.sender.name,
    body: m.body,
    attachment: m.attachmentKey ? { name: m.attachmentName, type: m.attachmentType, size: m.attachmentSize } : null,
    at: m.createdAt,
  };
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const conversationId = Number(params.id);
  if (!(await membership(conversationId, user.id))) return NextResponse.json({ error: "Not a member" }, { status: 403 });

  const after = Number(new URL(req.url).searchParams.get("after") ?? "0");
  const messages = await prisma.chatMessage.findMany({
    where: { conversationId, ...(after ? { id: { gt: after } } : {}) },
    orderBy: { createdAt: "asc" },
    take: 200,
    include: { sender: { select: { name: true } } },
  });
  const others = await prisma.conversationMember.findMany({
    where: { conversationId, userId: { not: user.id } },
    select: { userId: true, lastReadAt: true },
  });
  return NextResponse.json({ messages: messages.map(serialize), receipts: others });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const conversationId = Number(params.id);
  if (!(await membership(conversationId, user.id))) return NextResponse.json({ error: "Not a member" }, { status: 403 });

  const form = await req.formData();
  const body = String(form.get("body") ?? "").trim();
  const file = form.get("file");

  let attachmentKey: string | null = null;
  let attachmentName: string | null = null;
  let attachmentType: string | null = null;
  let attachmentSize: number | null = null;

  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "File exceeds 24 MB" }, { status: 400 });
    const bytes = Buffer.from(await file.arrayBuffer());
    const stored = await saveFile(bytes, file.name, file.type);
    attachmentKey = stored.storageKey;
    attachmentName = file.name;
    attachmentType = file.type || "application/octet-stream";
    attachmentSize = stored.sizeBytes;
  }

  if (!body && !attachmentKey) return NextResponse.json({ error: "Empty message" }, { status: 400 });

  const message = await prisma.chatMessage.create({
    data: { conversationId, senderId: user.id, body: body || null, attachmentKey, attachmentName, attachmentType, attachmentSize },
    include: { sender: { select: { name: true } } },
  });
  await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
  await prisma.conversationMember.updateMany({ where: { conversationId, userId: user.id }, data: { lastReadAt: new Date() } });

  return NextResponse.json({ message: serialize(message) });
}
