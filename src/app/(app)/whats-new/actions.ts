"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { toFormError, type FormResult } from "@/lib/form";

export async function markSeen(_prev: FormResult, _fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  try {
    await prisma.user.update({ where: { id: user.id }, data: { dashboardSeenAt: new Date() } });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath("/whats-new");
  revalidatePath("/dashboard");
  return { ok: true };
}
