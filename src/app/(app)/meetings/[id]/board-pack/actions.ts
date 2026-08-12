"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { notifyMany } from "@/lib/notifications";
import { saveFile, readFile } from "@/lib/storage";
import { compileBoardPack } from "@/lib/pdf";
import { getInt, getStr, toFormError, type FormResult } from "@/lib/form";
import { DOC_CLASSIFICATIONS, isOneOf } from "@/lib/enums";

const MAX_BYTES = 24 * 1024 * 1024;

async function ensureDraftPack(meetingId: number) {
  let pack = await prisma.boardPack.findFirst({ where: { meetingId, status: "Draft" }, orderBy: { version: "desc" } });
  if (!pack) {
    const last = await prisma.boardPack.findFirst({ where: { meetingId }, orderBy: { version: "desc" } });
    pack = await prisma.boardPack.create({ data: { meetingId, version: (last?.version ?? 0) + 1, status: "Draft" } });
  }
  return pack;
}

async function readUpload(fd: FormData): Promise<{ bytes: Buffer; fileName: string; mimeType: string } | { error: string }> {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };
  if (file.size > MAX_BYTES) return { error: "File exceeds 24 MB limit." };
  const bytes = Buffer.from(await file.arrayBuffer());
  return { bytes, fileName: file.name, mimeType: file.type || "application/octet-stream" };
}

export async function addSection(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const meetingId = getInt(fd, "meetingId");
  if (!meetingId) return { error: "Missing meeting." };
  try {
    assertCan(user, "boardpack.publish");
    const up = await readUpload(fd);
    if ("error" in up) return up;
    const title = getStr(fd, "title") || up.fileName;
    const classification = getStr(fd, "classification");
    const agendaItemId = getInt(fd, "agendaItemId");
    const restrictedToUserId = getInt(fd, "restrictedToUserId");

    const stored = await saveFile(up.bytes, up.fileName);
    const pack = await ensureDraftPack(meetingId);

    const doc = await prisma.document.create({
      data: {
        title,
        meetingId,
        agendaItemId: agendaItemId ?? null,
        classification: isOneOf(DOC_CLASSIFICATIONS, classification) ? classification : "Internal",
        storageKey: stored.storageKey,
        fileName: up.fileName,
        mimeType: up.mimeType,
        sizeBytes: stored.sizeBytes,
        uploadedById: user.id,
        version: 1,
      },
    });
    const maxSeq = await prisma.boardPackSection.aggregate({ where: { boardPackId: pack.id }, _max: { sequence: true } });
    await prisma.boardPackSection.create({
      data: {
        boardPackId: pack.id,
        agendaItemId: agendaItemId ?? null,
        documentId: doc.id,
        title,
        sequence: (maxSeq._max.sequence ?? 0) + 1,
        restrictedToUserId: restrictedToUserId ?? null,
      },
    });
    await audit({ actorId: user.id, action: "create", entityType: "Document", entityId: doc.id, meetingId, summary: `Added board-pack section "${title}"` });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`/meetings/${meetingId}/board-pack`);
  return { ok: true };
}

export async function replaceSectionDocument(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const meetingId = getInt(fd, "meetingId");
  const sectionId = getInt(fd, "sectionId");
  if (!meetingId || !sectionId) return { error: "Missing section." };
  try {
    assertCan(user, "boardpack.publish");
    const up = await readUpload(fd);
    if ("error" in up) return up;
    const section = await prisma.boardPackSection.findUnique({ where: { id: sectionId }, include: { document: true } });
    if (!section) return { error: "Section not found." };
    const stored = await saveFile(up.bytes, up.fileName);
    // New version supersedes the old document; the old version is retained, never overwritten.
    const newDoc = await prisma.document.create({
      data: {
        title: section.title,
        meetingId,
        agendaItemId: section.agendaItemId,
        classification: section.document?.classification ?? "Internal",
        storageKey: stored.storageKey,
        fileName: up.fileName,
        mimeType: up.mimeType,
        sizeBytes: stored.sizeBytes,
        uploadedById: user.id,
        version: (section.document?.version ?? 0) + 1,
        supersedesId: section.documentId,
      },
    });
    await prisma.boardPackSection.update({ where: { id: sectionId }, data: { documentId: newDoc.id } });
    await audit({ actorId: user.id, action: "version", entityType: "Document", entityId: newDoc.id, meetingId, summary: `New version (v${newDoc.version}) of "${section.title}"` });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`/meetings/${meetingId}/board-pack`);
  return { ok: true };
}

export async function removeSection(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const meetingId = getInt(fd, "meetingId");
  const sectionId = getInt(fd, "sectionId");
  if (!meetingId || !sectionId) return { error: "Missing section." };
  try {
    assertCan(user, "boardpack.publish");
    await prisma.boardPackSection.delete({ where: { id: sectionId } });
    await audit({ actorId: user.id, action: "delete", entityType: "BoardPackSection", entityId: sectionId, meetingId, summary: "Removed board-pack section" });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`/meetings/${meetingId}/board-pack`);
  return { ok: true };
}

export async function compilePack(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const meetingId = getInt(fd, "meetingId");
  if (!meetingId) return { error: "Missing meeting." };
  try {
    assertCan(user, "boardpack.publish");
    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) return { error: "Meeting not found." };
    const pack = await ensureDraftPack(meetingId);
    const sections = await prisma.boardPackSection.findMany({
      where: { boardPackId: pack.id },
      include: { document: true, agendaItem: { select: { sequence: true } } },
    });
    if (sections.length === 0) return { error: "Add at least one section before compiling." };
    sections.sort((a, b) => (a.agendaItem?.sequence ?? 999) - (b.agendaItem?.sequence ?? 999) || a.sequence - b.sequence);

    const packSections = await Promise.all(sections.map((s) => buildSection(s)));

    const pdf = await compileBoardPack({
      meetingTitle: meeting.title,
      meetingDate: meeting.scheduledAt,
      version: pack.version,
      sections: packSections,
    });
    const stored = await saveFile(pdf, `board-pack-v${pack.version}.pdf`);
    await prisma.boardPack.update({ where: { id: pack.id }, data: { compiledPdfKey: stored.storageKey } });
    await audit({ actorId: user.id, action: "compile", entityType: "BoardPack", entityId: pack.id, meetingId, summary: `Compiled board pack v${pack.version} (${sections.length} sections)` });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`/meetings/${meetingId}/board-pack`);
  return { ok: true };
}

async function buildSection(s: { title: string; document: { fileName: string; mimeType: string; storageKey: string; classification: string } | null }) {
  let document: { fileName: string; mimeType: string; bytes: Buffer } | null = null;
  if (s.document) {
    try {
      document = { fileName: s.document.fileName, mimeType: s.document.mimeType, bytes: await readFile(s.document.storageKey) };
    } catch {
      document = null;
    }
  }
  return { title: s.title, classification: s.document?.classification, document };
}

export async function publishPack(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const meetingId = getInt(fd, "meetingId");
  if (!meetingId) return { error: "Missing meeting." };
  try {
    assertCan(user, "boardpack.publish");
    const pack = await prisma.boardPack.findFirst({ where: { meetingId, status: "Draft" }, orderBy: { version: "desc" } });
    if (!pack) return { error: "No draft pack to publish." };
    if (!pack.compiledPdfKey) return { error: "Compile the pack before publishing." };
    await prisma.boardPack.update({ where: { id: pack.id }, data: { status: "Published", publishedAt: new Date(), publishedById: user.id } });
    // Publishing circulates the agenda — lock it.
    await prisma.agendaItem.updateMany({ where: { meetingId, deletedAt: null, lockedAt: null }, data: { lockedAt: new Date() } });
    const attendees = await prisma.attendance.findMany({ where: { meetingId }, select: { userId: true } });
    await audit({ actorId: user.id, action: "publish", entityType: "BoardPack", entityId: pack.id, meetingId, summary: `Published board pack v${pack.version}` });
    await notifyMany(attendees.map((a) => a.userId), {
      type: "BoardPackPublished",
      channel: "Email",
      subject: "Board pack published",
      body: "The board pack for your upcoming meeting has been published and is available to view.",
      relatedEntityType: "Meeting",
      relatedEntityId: meetingId,
    });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`/meetings/${meetingId}/board-pack`);
  return { ok: true };
}

export async function revertSectionDocument(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const meetingId = getInt(fd, "meetingId");
  const sectionId = getInt(fd, "sectionId");
  const documentId = getInt(fd, "documentId");
  if (!meetingId || !sectionId || !documentId) return { error: "Missing parameters." };
  try {
    assertCan(user, "boardpack.publish");
    const section = await prisma.boardPackSection.findUnique({ where: { id: sectionId } });
    if (!section) return { error: "Section not found." };
    const targetDoc = await prisma.document.findUnique({ where: { id: documentId } });
    if (!targetDoc || targetDoc.deletedAt) return { error: "Document not found." };
    
    await prisma.boardPackSection.update({
      where: { id: sectionId },
      data: { documentId },
    });
    await audit({ actorId: user.id, action: "revert", entityType: "Document", entityId: documentId, meetingId, summary: `Reverted "${section.title}" to version ${targetDoc.version}` });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`/meetings/${meetingId}/board-pack`);
  return { ok: true };
}
