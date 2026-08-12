import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ROLE_LABELS, type Role } from "@/lib/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// People you can start a chat with / add to a group.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";

  const users = await prisma.user.findMany({
    where: { deletedAt: null, status: "Active", id: { not: user.id }, ...(q ? { name: { contains: q } } : {}) },
    select: { id: true, name: true, role: true, designation: true },
    orderBy: { name: "asc" },
    take: 50,
  });
  return NextResponse.json({ users: users.map((u) => ({ ...u, roleLabel: ROLE_LABELS[u.role as Role] ?? u.role })) });
}
