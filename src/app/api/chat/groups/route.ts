import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canCreateGroup } from "@/lib/chat";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Create a group chat (admin / company secretary only).
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!canCreateGroup(user.role)) return NextResponse.json({ error: "Only an administrator can create groups" }, { status: 403 });

  const { name, memberIds } = (await req.json()) as { name?: string; memberIds?: number[] };
  const trimmed = (name ?? "").trim();
  if (trimmed.length < 2) return NextResponse.json({ error: "Group name is required" }, { status: 400 });
  const ids = Array.from(new Set((memberIds ?? []).filter((id) => Number.isInteger(id) && id !== user.id)));
  if (ids.length === 0) return NextResponse.json({ error: "Add at least one member" }, { status: 400 });

  const convo = await prisma.conversation.create({
    data: {
      type: "Group",
      name: trimmed,
      createdById: user.id,
      members: { create: [{ userId: user.id, role: "admin" }, ...ids.map((userId) => ({ userId }))] },
    },
  });
  await audit({ actorId: user.id, action: "create", entityType: "Conversation", entityId: convo.id, summary: `Created group "${trimmed}" (${ids.length + 1} members)` });
  return NextResponse.json({ id: convo.id });
}
