import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Mark a conversation as read up to now.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  await prisma.conversationMember.updateMany({ where: { conversationId: Number(params.id), userId: user.id }, data: { lastReadAt: new Date() } });
  return NextResponse.json({ ok: true });
}
