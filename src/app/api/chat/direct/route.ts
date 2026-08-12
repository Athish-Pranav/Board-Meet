import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Find or create a 1-to-1 conversation with another user.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const { userId } = (await req.json()) as { userId?: number };
  if (!userId || userId === user.id) return NextResponse.json({ error: "Invalid user" }, { status: 400 });

  const other = await prisma.user.findFirst({ where: { id: userId, deletedAt: null, status: "Active" } });
  if (!other) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Existing direct conversation between the two?
  const existing = await prisma.conversation.findFirst({
    where: { type: "Direct", members: { every: { userId: { in: [user.id, userId] } } }, AND: [{ members: { some: { userId: user.id } } }, { members: { some: { userId } } }] },
    select: { id: true },
  });
  if (existing) return NextResponse.json({ id: existing.id });

  const convo = await prisma.conversation.create({
    data: {
      type: "Direct",
      createdById: user.id,
      members: { create: [{ userId: user.id }, { userId }] },
    },
  });
  return NextResponse.json({ id: convo.id });
}
