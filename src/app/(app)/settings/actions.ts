"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { getInt, getStr, getBool, toFormError, type FormResult } from "@/lib/form";
import { FOLDER_CATEGORIES, isOneOf } from "@/lib/enums";

export async function updateRetentionPolicy(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  try {
    assertCan(user, "retention.manage");
    const category = getStr(fd, "category");
    if (!isOneOf(FOLDER_CATEGORIES, category)) return { error: "Unknown category." };
    const permanent = getBool(fd, "permanent");
    const retainYears = getInt(fd, "retainYears");
    const action = getStr(fd, "action") === "Archive" ? "Archive" : "Flag";
    await prisma.retentionPolicy.upsert({
      where: { category },
      update: { permanent, retainYears: permanent ? null : retainYears, action },
      create: { category, permanent, retainYears: permanent ? null : retainYears, action },
    });
    await audit({ actorId: user.id, action: "update", entityType: "RetentionPolicy", summary: `Updated retention for ${category}` });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath("/settings");
  return { ok: true };
}

/**
 * Retention scan (Phase 4): archives documents whose folder category has a
 * non-permanent Archive policy and whose age exceeds the retention period.
 * Minutes & resolutions are permanent records and are never auto-deleted.
 */
export async function runRetentionScan(_prev: FormResult, _fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  let archived = 0;
  try {
    assertCan(user, "retention.manage");
    const policies = await prisma.retentionPolicy.findMany();
    const now = new Date();
    for (const p of policies) {
      if (p.permanent || p.action !== "Archive" || !p.retainYears) continue;
      const cutoff = new Date(now.getFullYear() - p.retainYears, now.getMonth(), now.getDate());
      const res = await prisma.document.updateMany({
        where: { deletedAt: null, archivedAt: null, uploadedAt: { lt: cutoff }, folder: { category: p.category } },
        data: { archivedAt: now },
      });
      archived += res.count;
    }
    await audit({ actorId: user.id, action: "retention-scan", entityType: "Document", summary: `Retention scan archived ${archived} document(s)` });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath("/settings");
  return { ok: true, ...(archived === 0 ? { error: "Scan complete — no documents past retention." } : {}) };
}
