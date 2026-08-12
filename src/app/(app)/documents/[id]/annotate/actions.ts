"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getInt, getStr, toFormError, type FormResult } from "@/lib/form";

export async function addAnnotation(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const documentId = getInt(fd, "documentId");
  if (!documentId) return { error: "Missing document." };
  try {
    const note = getStr(fd, "note");
    const quoted = getStr(fd, "quoted");
    if (!note && !quoted) return { error: "Add a note or a highlighted passage." };
    await prisma.annotation.create({
      data: {
        documentId,
        userId: user.id,
        page: getInt(fd, "page") ?? 1,
        color: getStr(fd, "color") || "#ffeb3b",
        rectsJson: JSON.stringify({ quoted }),
        note: note || null,
      },
    });
    await audit({ actorId: user.id, action: "annotate", entityType: "Document", entityId: documentId, summary: "Added annotation" });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`/documents/${documentId}/annotate`);
  return { ok: true };
}

export async function deleteAnnotation(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const id = getInt(fd, "id");
  const documentId = getInt(fd, "documentId");
  if (!id || !documentId) return { error: "Missing annotation." };
  try {
    await prisma.annotation.deleteMany({ where: { id, userId: user.id } });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`/documents/${documentId}/annotate`);
  return { ok: true };
}
