"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getInt, toFormError, type FormResult } from "@/lib/form";

export async function markRead(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const id = getInt(fd, "id");
  if (!id) return { error: "Missing notification." };
  try {
    await prisma.notification.updateMany({ where: { id, userId: user.id }, data: { status: "Read", readAt: new Date() } });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath("/notifications");
  return { ok: true };
}

export async function markAllRead(_prev: FormResult, _fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  try {
    await prisma.notification.updateMany({ where: { userId: user.id, status: { not: "Read" } }, data: { status: "Read", readAt: new Date() } });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath("/notifications");
  return { ok: true };
}
