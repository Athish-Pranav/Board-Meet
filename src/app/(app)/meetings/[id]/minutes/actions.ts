"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { notifyMany } from "@/lib/notifications";
import { saveFile } from "@/lib/storage";
import { getInt, getStr, toFormError, type FormResult } from "@/lib/form";

const MAX_BYTES = 24 * 1024 * 1024;

async function getOrCreateMinutes(meetingId: number) {
  let m = await prisma.minutes.findUnique({ where: { meetingId } });
  if (!m) m = await prisma.minutes.create({ data: { meetingId, status: "Draft", content: "" } });
  return m;
}

export async function saveMinutesDraft(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const meetingId = getInt(fd, "meetingId");
  if (!meetingId) return { error: "Missing meeting." };
  try {
    assertCan(user, "minutes.draft");
    const m = await getOrCreateMinutes(meetingId);
    if (m.status !== "Draft") return { error: "Minutes are no longer in draft. Add an addendum for any correction." };
    const content = z.string().min(1, "Minutes content cannot be empty").parse(getStr(fd, "content"));
    await prisma.minutes.update({ where: { id: m.id }, data: { content } });
    await audit({ actorId: user.id, action: "update", entityType: "Minutes", entityId: m.id, meetingId, summary: "Saved minutes draft" });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`/meetings/${meetingId}/minutes`);
  return { ok: true };
}

export async function circulateMinutes(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const meetingId = getInt(fd, "meetingId");
  if (!meetingId) return { error: "Missing meeting." };
  try {
    assertCan(user, "minutes.circulate");
    const m = await prisma.minutes.findUnique({ where: { meetingId } });
    if (!m) return { error: "Draft the minutes first." };
    if (m.status !== "Draft") return { error: "Minutes already circulated." };
    if (!m.content.trim()) return { error: "Cannot circulate empty minutes." };
    await prisma.minutes.update({ where: { id: m.id }, data: { status: "Circulated", circulatedAt: new Date() } });
    const directors = await prisma.user.findMany({ where: { isDirector: true, deletedAt: null, status: "Active" }, select: { id: true } });
    await audit({ actorId: user.id, action: "circulate", entityType: "Minutes", entityId: m.id, meetingId, summary: "Circulated minutes for review" });
    await notifyMany(directors.map((d) => d.id), {
      type: "MinutesCirculated",
      subject: "Minutes circulated for review",
      body: "Draft minutes have been circulated. Please review and add any comments before approval.",
      relatedEntityType: "Meeting",
      relatedEntityId: meetingId,
    });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`/meetings/${meetingId}/minutes`);
  return { ok: true };
}

export async function commentMinutes(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const meetingId = getInt(fd, "meetingId");
  if (!meetingId) return { error: "Missing meeting." };
  try {
    assertCan(user, "minutes.comment");
    const m = await prisma.minutes.findUnique({ where: { meetingId } });
    if (!m) return { error: "No minutes to comment on." };
    const comment = z.string().min(1, "Comment cannot be empty").parse(getStr(fd, "comment"));
    await prisma.minutesComment.create({ data: { minutesId: m.id, userId: user.id, comment } });
    await audit({ actorId: user.id, action: "comment", entityType: "Minutes", entityId: m.id, meetingId, summary: "Commented on minutes" });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`/meetings/${meetingId}/minutes`);
  return { ok: true };
}

export async function approveMinutes(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const meetingId = getInt(fd, "meetingId");
  if (!meetingId) return { error: "Missing meeting." };
  try {
    assertCan(user, "minutes.approve");
    const m = await prisma.minutes.findUnique({ where: { meetingId } });
    if (!m) return { error: "No minutes found." };
    if (m.status !== "Circulated") return { error: "Minutes must be circulated before approval." };
    await prisma.minutes.update({ where: { id: m.id }, data: { status: "Approved", approvedAt: new Date(), finalizedAt: new Date(), signedById: user.id } });
    await audit({ actorId: user.id, action: "approve", entityType: "Minutes", entityId: m.id, meetingId, summary: `Minutes approved & signed by ${user.name}` });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`/meetings/${meetingId}/minutes`);
  return { ok: true };
}

export async function publishMinutes(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const meetingId = getInt(fd, "meetingId");
  if (!meetingId) return { error: "Missing meeting." };
  try {
    assertCan(user, "minutes.circulate"); // CS enters minutes into the minute book
    const m = await prisma.minutes.findUnique({ where: { meetingId } });
    if (!m) return { error: "No minutes found." };
    if (m.status !== "Approved") return { error: "Minutes must be approved before publishing." };
    await prisma.minutes.update({ where: { id: m.id }, data: { status: "Published" } });
    await audit({ actorId: user.id, action: "publish", entityType: "Minutes", entityId: m.id, meetingId, summary: "Minutes entered into the minute book" });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`/meetings/${meetingId}/minutes`);
  revalidatePath(`/minutes`);
  return { ok: true };
}

export async function addAddendum(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const meetingId = getInt(fd, "meetingId");
  if (!meetingId) return { error: "Missing meeting." };
  try {
    assertCan(user, "minutes.draft");
    const m = await prisma.minutes.findUnique({ where: { meetingId } });
    if (!m) return { error: "No minutes found." };
    if (m.status !== "Approved" && m.status !== "Published") return { error: "Addenda apply only to finalized minutes." };
    const content = z.string().min(1, "Addendum cannot be empty").parse(getStr(fd, "content"));
    await prisma.minutesAddendum.create({ data: { minutesId: m.id, content, createdById: user.id } });
    await audit({ actorId: user.id, action: "addendum", entityType: "Minutes", entityId: m.id, meetingId, summary: "Added minutes addendum (correction)" });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`/meetings/${meetingId}/minutes`);
  return { ok: true };
}

/** Attach a supporting file (e.g. the signed scanned minutes) to the minutes. */
export async function uploadMinutesFile(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const meetingId = getInt(fd, "meetingId");
  if (!meetingId) return { error: "Missing meeting." };
  try {
    assertCan(user, "minutes.draft");
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };
    if (file.size > MAX_BYTES) return { error: "File exceeds 24 MB limit." };
    const m = await getOrCreateMinutes(meetingId);
    const bytes = Buffer.from(await file.arrayBuffer());
    const title = getStr(fd, "title") || file.name;
    const stored = await saveFile(bytes, file.name);
    const doc = await prisma.document.create({
      data: {
        title,
        minutesId: m.id,
        meetingId,
        classification: "Internal",
        storageKey: stored.storageKey,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: stored.sizeBytes,
        uploadedById: user.id,
      },
    });
    await audit({ actorId: user.id, action: "create", entityType: "Document", entityId: doc.id, meetingId, summary: `Attached "${title}" to minutes` });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`/meetings/${meetingId}/minutes`);
  return { ok: true };
}

/** Remove (soft-delete) a minutes attachment. */
export async function removeMinutesFile(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const meetingId = getInt(fd, "meetingId");
  const docId = getInt(fd, "docId");
  if (!meetingId || !docId) return { error: "Missing attachment." };
  try {
    assertCan(user, "minutes.draft");
    const doc = await prisma.document.findUnique({ where: { id: docId } });
    if (!doc || doc.deletedAt) return { error: "Attachment not found." };
    await prisma.document.update({ where: { id: docId }, data: { deletedAt: new Date() } });
    await audit({ actorId: user.id, action: "delete", entityType: "Document", entityId: docId, meetingId, summary: `Removed minutes attachment "${doc.title}"` });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`/meetings/${meetingId}/minutes`);
  return { ok: true };
}
