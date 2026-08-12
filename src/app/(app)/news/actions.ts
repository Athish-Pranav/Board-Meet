"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notifyMany } from "@/lib/notifications";
import { getInt, getStr, getOptStr, getBool, toFormError, type FormResult } from "@/lib/form";
import { ANNOUNCEMENT_CATEGORIES, isOneOf } from "@/lib/enums";
import { canPostNews } from "@/lib/news";

export async function createAnnouncement(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  try {
    if (!canPostNews(user.role)) return { error: "You don't have permission to post." };
    const title = z.string().min(3, "Title is required").parse(getStr(fd, "title"));
    const body = z.string().min(3, "Message is required").parse(getStr(fd, "body"));
    const category = getStr(fd, "category");
    const a = await prisma.announcement.create({
      data: {
        title,
        body,
        category: isOneOf(ANNOUNCEMENT_CATEGORIES, category) ? category : "News",
        pinned: getBool(fd, "pinned"),
        linkUrl: getOptStr(fd, "linkUrl"),
        documentId: getInt(fd, "documentId"),
        createdById: user.id,
      },
    });
    await audit({ actorId: user.id, action: "create", entityType: "Announcement", entityId: a.id, summary: `Posted "${title}"` });

    if (getBool(fd, "notify")) {
      const members = await prisma.user.findMany({ where: { status: "Active", deletedAt: null }, select: { id: true } });
      await notifyMany(members.map((m) => m.id), { type: "News", subject: title, body, relatedEntityType: "Announcement", relatedEntityId: a.id });
    }
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath("/news");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteAnnouncement(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const id = getInt(fd, "id");
  if (!id) return { error: "Missing item." };
  try {
    if (!canPostNews(user.role)) return { error: "You don't have permission." };
    await prisma.announcement.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit({ actorId: user.id, action: "delete", entityType: "Announcement", entityId: id, summary: "Removed announcement" });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath("/news");
  revalidatePath("/dashboard");
  return { ok: true };
}
