"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { getInt, getStr, getBool, toFormError, type FormResult } from "@/lib/form";

export async function declareConflict(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  try {
    assertCan(user, "conflicts.declare");
    const nature = z.string().min(3, "Describe the nature of the interest").parse(getStr(fd, "nature"));
    const decl = await prisma.conflictDeclaration.create({
      data: {
        userId: user.id,
        nature,
        meetingId: getInt(fd, "meetingId"),
        agendaItemId: getInt(fd, "agendaItemId"),
        recused: getBool(fd, "recused"),
      },
    });
    await audit({ actorId: user.id, action: "declare", entityType: "ConflictDeclaration", entityId: decl.id, meetingId: decl.meetingId, summary: "Declared interest" });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath("/conflicts");
  return { ok: true };
}

export async function withdrawConflict(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const id = getInt(fd, "id");
  if (!id) return { error: "Missing declaration." };
  try {
    const decl = await prisma.conflictDeclaration.findUnique({ where: { id } });
    if (!decl) return { error: "Not found." };
    if (decl.userId !== user.id) return { error: "You can only withdraw your own declaration." };
    await prisma.conflictDeclaration.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit({ actorId: user.id, action: "withdraw", entityType: "ConflictDeclaration", entityId: id, summary: "Withdrew declaration" });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath("/conflicts");
  return { ok: true };
}
