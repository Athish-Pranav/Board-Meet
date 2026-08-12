import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// List my conversations with display name, last message preview and unread count.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const memberships = await prisma.conversationMember.findMany({
    where: { userId: user.id },
    include: { conversation: { include: { members: { include: { user: { select: { id: true, name: true } } } } } } },
  });
  if (memberships.length === 0) return NextResponse.json({ conversations: [], unreadTotal: 0 });

  const convoIds = memberships.map((m) => m.conversationId);

  // One query for the latest message per conversation (Prisma's distinct+orderBy
  // pattern), instead of a findFirst per conversation.
  const latestMessages = await prisma.chatMessage.findMany({
    where: { conversationId: { in: convoIds } },
    orderBy: { createdAt: "desc" },
    distinct: ["conversationId"],
    include: { sender: { select: { name: true } } },
  });
  const lastByConvo = new Map(latestMessages.map((m) => [m.conversationId, m]));

  // One query for every message that could be unread, instead of a count
  // query per conversation. Bounded by the oldest lastReadAt across this
  // user's memberships when possible; unread counts are then computed
  // per-conversation in memory against each membership's own lastReadAt.
  const readTimes = memberships.map((m) => m.lastReadAt);
  const nonNullReadTimes = readTimes.filter((t): t is Date => t !== null);
  const oldestCutoff =
    nonNullReadTimes.length === readTimes.length
      ? nonNullReadTimes.reduce((min, t) => (t < min ? t : min), nonNullReadTimes[0])
      : null;
  const unreadCandidates = await prisma.chatMessage.findMany({
    where: {
      conversationId: { in: convoIds },
      senderId: { not: user.id },
      ...(oldestCutoff ? { createdAt: { gt: oldestCutoff } } : {}),
    },
    select: { conversationId: true, createdAt: true },
  });

  const items = memberships.map((m) => {
    const convo = m.conversation;
    const other = convo.type === "Direct" ? convo.members.find((x) => x.userId !== user.id)?.user : null;
    const last = lastByConvo.get(convo.id) ?? null;
    const unread = unreadCandidates.reduce(
      (n, c) => (c.conversationId === convo.id && (!m.lastReadAt || c.createdAt > m.lastReadAt) ? n + 1 : n),
      0,
    );
    return {
      id: convo.id,
      type: convo.type,
      name: convo.type === "Group" ? convo.name ?? "Group" : other?.name ?? "Chat",
      memberCount: convo.members.length,
      members: convo.members.map((x) => ({ id: x.user.id, name: x.user.name, role: x.role })),
      lastMessage: last ? { body: last.body, attachmentName: last.attachmentName, senderName: last.sender.name, senderId: last.senderId, at: last.createdAt } : null,
      unread,
      updatedAt: convo.updatedAt,
    };
  });

  items.sort((a, b) => new Date(b.lastMessage?.at ?? b.updatedAt).getTime() - new Date(a.lastMessage?.at ?? a.updatedAt).getTime());
  return NextResponse.json({ conversations: items, unreadTotal: items.reduce((s, c) => s + c.unread, 0) });
}
