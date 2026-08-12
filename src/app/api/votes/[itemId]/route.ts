import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { itemId: string } }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const itemId = Number(params.itemId);
  if (isNaN(itemId)) return new NextResponse("Invalid ID", { status: 400 });

  const item = await prisma.agendaItem.findUnique({
    where: { id: itemId, deletedAt: null },
    select: {
      votingStatus: true,
      votes: {
        include: { user: { select: { name: true } } },
        orderBy: { votedAt: "asc" },
      },
    },
  });

  if (!item) return new NextResponse("Not Found", { status: 404 });

  return NextResponse.json({
    votingStatus: item.votingStatus,
    votes: item.votes,
  });
}
