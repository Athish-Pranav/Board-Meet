"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { saveFile } from "@/lib/storage";
import { getInt, getStr, toFormError, type FormResult } from "@/lib/form";
import { DOC_CLASSIFICATIONS, FOLDER_CATEGORIES, isOneOf } from "@/lib/enums";

const MAX_BYTES = 24 * 1024 * 1024;

export async function createFolder(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  try {
    assertCan(user, "documents.manage");
    const name = z.string().min(2, "Folder name is required").parse(getStr(fd, "name"));
    const category = getStr(fd, "category");
    const folder = await prisma.folder.create({
      data: { name, category: isOneOf(FOLDER_CATEGORIES, category) ? category : "General", parentId: getInt(fd, "parentId") },
    });
    await audit({ actorId: user.id, action: "create", entityType: "Folder", entityId: folder.id, summary: `Created folder "${name}"` });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath("/documents");
  return { ok: true };
}

export async function uploadRepositoryDocument(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  try {
    assertCan(user, "documents.manage");
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };
    if (file.size > MAX_BYTES) return { error: "File exceeds 24 MB limit." };
    const bytes = Buffer.from(await file.arrayBuffer());
    const title = getStr(fd, "title") || file.name;
    const classification = getStr(fd, "classification");
    const folderId = getInt(fd, "folderId");
    const stored = await saveFile(bytes, file.name);
    const doc = await prisma.document.create({
      data: {
        title,
        folderId: folderId ?? null,
        classification: isOneOf(DOC_CLASSIFICATIONS, classification) ? classification : "Internal",
        storageKey: stored.storageKey,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: stored.sizeBytes,
        uploadedById: user.id,
      },
    });
    await audit({ actorId: user.id, action: "create", entityType: "Document", entityId: doc.id, summary: `Uploaded "${title}" to repository` });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath("/documents");
  return { ok: true };
}

export async function archiveDocument(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const docId = getInt(fd, "docId");
  if (!docId) return { error: "Missing document." };
  try {
    assertCan(user, "documents.manage");
    const doc = await prisma.document.findUnique({ where: { id: docId } });
    if (!doc) return { error: "Not found." };
    await prisma.document.update({ where: { id: docId }, data: { archivedAt: doc.archivedAt ? null : new Date() } });
    await audit({ actorId: user.id, action: "archive", entityType: "Document", entityId: docId, summary: doc.archivedAt ? "Unarchived document" : "Archived document" });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath("/documents");
  return { ok: true };
}
