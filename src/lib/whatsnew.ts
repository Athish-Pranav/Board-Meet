import "server-only";
import { prisma } from "./db";

export type WhatsNew = Awaited<ReturnType<typeof getWhatsNew>>;

/**
 * Items created/updated since the user last marked their dashboard "seen".
 * For a brand-new user (no marker) we look back 14 days so the feed is useful
 * but not overwhelming.
 */
export async function getWhatsNew(userId: number) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { dashboardSeenAt: true } });
  const since = user?.dashboardSeenAt ?? new Date(Date.now() - 14 * 86400000);

  const [documents, boardPacks, minutes, announcements, actions] = await Promise.all([
    prisma.document.findMany({
      where: { deletedAt: null, uploadedAt: { gt: since }, OR: [{ folderId: { not: null } }, { meetingId: { not: null } }] },
      include: { meeting: { select: { id: true, title: true } }, folder: { select: { name: true } } },
      orderBy: { uploadedAt: "desc" },
      take: 20,
    }),
    prisma.boardPack.findMany({
      where: { status: "Published", publishedAt: { gt: since } },
      include: { meeting: { select: { id: true, title: true } } },
      orderBy: { publishedAt: "desc" },
      take: 10,
    }),
    prisma.minutes.findMany({
      where: { status: { in: ["Circulated", "Approved", "Published"] }, OR: [{ circulatedAt: { gt: since } }, { approvedAt: { gt: since } }] },
      include: { meeting: { select: { id: true, title: true } } },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
    prisma.announcement.findMany({
      where: { deletedAt: null, createdAt: { gt: since } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.actionItem.findMany({
      where: { deletedAt: null, assigneeId: userId, createdAt: { gt: since } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const total = documents.length + boardPacks.length + minutes.length + announcements.length + actions.length;
  return { since, total, documents, boardPacks, minutes, announcements, actions };
}
