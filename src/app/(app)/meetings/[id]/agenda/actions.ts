"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { assertCan, can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { getStr, getOptStr, getInt, toFormError, type FormResult } from "@/lib/form";
import { tallyVotes } from "@/lib/compliance";
import { notifyMany } from "@/lib/notifications";
import { saveFile } from "@/lib/storage";
import { AGENDA_CLASSIFICATIONS, DOC_CLASSIFICATIONS, MAJORITY_RULES, VOTE_CHOICES, isOneOf, type VoteChoice } from "@/lib/enums";

async function agendaIsLocked(meetingId: number): Promise<boolean> {
  const locked = await prisma.agendaItem.findFirst({ where: { meetingId, deletedAt: null, lockedAt: { not: null } }, select: { id: true } });
  return Boolean(locked);
}

const itemSchema = z.object({ title: z.string().min(2, "Item title is required") });
const MAX_DOC_BYTES = 24 * 1024 * 1024;

// Upload a board paper for an agenda item: stores the file, creates the Document
// (linked to the item) and adds it to the meeting's draft board pack. This is
// what lets the board pack be built straight from the agenda — no separate step.
async function attachAgendaDocument(meetingId: number, item: { id: number; title: string }, file: File, uploadedById: number, classification: string) {
  if (file.size > MAX_DOC_BYTES) throw new Error("File exceeds the 24 MB limit.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const stored = await saveFile(bytes, file.name, file.type);
  const doc = await prisma.document.create({
    data: {
      title: file.name,
      meetingId,
      agendaItemId: item.id,
      classification: isOneOf(DOC_CLASSIFICATIONS, classification) ? classification : "Internal",
      storageKey: stored.storageKey,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: stored.sizeBytes,
      uploadedById,
      version: 1,
    },
  });
  let pack = await prisma.boardPack.findFirst({ where: { meetingId, status: "Draft" }, orderBy: { version: "desc" } });
  if (!pack) {
    const last = await prisma.boardPack.findFirst({ where: { meetingId }, orderBy: { version: "desc" } });
    pack = await prisma.boardPack.create({ data: { meetingId, version: (last?.version ?? 0) + 1, status: "Draft" } });
  }
  const maxSeq = await prisma.boardPackSection.aggregate({ where: { boardPackId: pack.id }, _max: { sequence: true } });
  await prisma.boardPackSection.create({
    data: { boardPackId: pack.id, agendaItemId: item.id, documentId: doc.id, title: item.title, sequence: (maxSeq._max.sequence ?? 0) + 1 },
  });
}

export async function addAgendaItem(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const meetingId = getInt(fd, "meetingId");
  if (!meetingId) return { error: "Missing meeting." };
  try {
    if (!can(user.role, "agenda.draft") && !can(user.role, "agenda.propose")) {
      return { error: "You don't have permission to add agenda items." };
    }
    const { title } = itemSchema.parse({ title: getStr(fd, "title") });
    const classification = getStr(fd, "classification");
    const majorityRule = getStr(fd, "majorityRule");
    const presenterId = getInt(fd, "presenterId");
    const proposeOnly = !can(user.role, "agenda.draft");
    const locked = await agendaIsLocked(meetingId);

    // Optional parent → this is a sub-agenda item. Only one level of nesting is
    // allowed, and the parent must belong to the same meeting.
    const parentId = getInt(fd, "parentId");
    if (parentId) {
      const parent = await prisma.agendaItem.findUnique({ where: { id: parentId }, select: { meetingId: true, parentId: true, deletedAt: true } });
      if (!parent || parent.deletedAt || parent.meetingId !== meetingId) return { error: "Parent agenda item not found." };
      if (parent.parentId) return { error: "Sub-items can only be one level deep." };
    }

    // Sequence is scoped to the item's own level (siblings sharing parentId).
    const max = await prisma.agendaItem.aggregate({ where: { meetingId, deletedAt: null, parentId: parentId ?? null }, _max: { sequence: true } });

    const item = await prisma.agendaItem.create({
      data: {
        meetingId,
        parentId: parentId ?? null,
        sequence: (max._max.sequence ?? 0) + 1,
        title,
        description: getOptStr(fd, "description"),
        classification: isOneOf(AGENDA_CLASSIFICATIONS, classification) ? classification : "ForDiscussion",
        majorityRule: isOneOf(MAJORITY_RULES, majorityRule) ? majorityRule : "Simple",
        presenterId: presenterId ?? null,
        proposedById: proposeOnly ? user.id : null,
        isSupplementary: locked, // anything added after lock is a tracked supplementary item
      },
    });
    await audit({
      actorId: user.id,
      action: "create",
      entityType: "AgendaItem",
      entityId: item.id,
      meetingId,
      summary: `${proposeOnly ? "Proposed" : "Added"} ${parentId ? "sub-item" : "agenda item"} "${title}"${locked ? " (supplementary)" : ""}`,
      after: item,
    });
    // Board paper uploaded with the agenda item → straight into the board pack.
    const file = fd.get("file");
    if (file instanceof File && file.size > 0) {
      await attachAgendaDocument(meetingId, { id: item.id, title }, file, user.id, getStr(fd, "docClassification"));
    }
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`/meetings/${meetingId}/agenda`);
  revalidatePath(`/meetings/${meetingId}/board-pack`);
  return { ok: true };
}

export async function updateAgendaItem(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const meetingId = getInt(fd, "meetingId");
  const itemId = getInt(fd, "itemId");
  if (!meetingId || !itemId) return { error: "Missing item." };
  try {
    assertCan(user, "agenda.draft");
    const existing = await prisma.agendaItem.findUnique({ where: { id: itemId } });
    if (!existing || existing.deletedAt) return { error: "Item not found." };
    if (existing.lockedAt && !existing.isSupplementary) {
      return { error: "This item is locked. Add a supplementary item instead of editing it." };
    }
    const { title } = itemSchema.parse({ title: getStr(fd, "title") });
    const classification = getStr(fd, "classification");
    const majorityRule = getStr(fd, "majorityRule");
    const presenterId = getInt(fd, "presenterId");
    // Majority rule can only change before the item is circulated for voting.
    const nextMajority = existing.votingStatus === "None" && isOneOf(MAJORITY_RULES, majorityRule) ? majorityRule : existing.majorityRule;
    const updated = await prisma.agendaItem.update({
      where: { id: itemId },
      data: {
        title,
        description: getOptStr(fd, "description"),
        classification: isOneOf(AGENDA_CLASSIFICATIONS, classification) ? classification : existing.classification,
        majorityRule: nextMajority,
        presenterId: presenterId ?? null,
      },
    });
    await audit({ actorId: user.id, action: "update", entityType: "AgendaItem", entityId: itemId, meetingId, summary: `Edited agenda item "${title}"`, before: existing, after: updated });
    const file = fd.get("file");
    if (file instanceof File && file.size > 0) {
      await attachAgendaDocument(meetingId, { id: itemId, title }, file, user.id, getStr(fd, "docClassification"));
    }
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`/meetings/${meetingId}/agenda`);
  revalidatePath(`/meetings/${meetingId}/board-pack`);
  return { ok: true };
}

export async function removeAgendaItem(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const meetingId = getInt(fd, "meetingId");
  const itemId = getInt(fd, "itemId");
  if (!meetingId || !itemId) return { error: "Missing item." };
  try {
    assertCan(user, "agenda.draft");
    const existing = await prisma.agendaItem.findUnique({ where: { id: itemId } });
    if (!existing || existing.deletedAt) return { error: "Item not found." };
    if (existing.lockedAt && !existing.isSupplementary) return { error: "Locked items cannot be removed." };
    // Removing a parent also removes its sub-items.
    const now = new Date();
    await prisma.agendaItem.updateMany({ where: { OR: [{ id: itemId }, { parentId: itemId }], deletedAt: null }, data: { deletedAt: now } });
    await audit({ actorId: user.id, action: "delete", entityType: "AgendaItem", entityId: itemId, meetingId, summary: `Removed ${existing.parentId ? "sub-item" : "agenda item"} "${existing.title}"` });

    // Re-sequence remaining siblings to ensure continuous serial numbers
    const remaining = await prisma.agendaItem.findMany({
      where: { meetingId, deletedAt: null, parentId: existing.parentId },
      orderBy: { sequence: "asc" },
      select: { id: true }
    });
    if (remaining.length > 0) {
      await prisma.$transaction(remaining.map((item, idx) =>
        prisma.agendaItem.update({ where: { id: item.id }, data: { sequence: idx + 1 } })
      ));
    }
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`/meetings/${meetingId}/agenda`);
  return { ok: true };
}

export async function moveAgendaItem(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const meetingId = getInt(fd, "meetingId");
  const itemId = getInt(fd, "itemId");
  const dir = getStr(fd, "dir");
  if (!meetingId || !itemId) return { error: "Missing item." };
  try {
    assertCan(user, "agenda.draft");
    const items = await prisma.agendaItem.findMany({ where: { meetingId, deletedAt: null }, orderBy: { sequence: "asc" } });
    const idx = items.findIndex((i) => i.id === itemId);
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swapIdx < 0 || swapIdx >= items.length) return { ok: true };
    const a = items[idx];
    const b = items[swapIdx];
    await prisma.$transaction([
      prisma.agendaItem.update({ where: { id: a.id }, data: { sequence: b.sequence } }),
      prisma.agendaItem.update({ where: { id: b.id }, data: { sequence: a.sequence } }),
    ]);
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`/meetings/${meetingId}/agenda`);
  return { ok: true };
}

// Drag-to-reorder: persist the full ordering in one transaction.
export async function reorderAgenda(meetingId: number, orderedIds: number[]): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  try {
    assertCan(user, "agenda.draft");
    const items = await prisma.agendaItem.findMany({ where: { meetingId, deletedAt: null }, select: { id: true } });
    const valid = new Set(items.map((i) => i.id));
    const ids = orderedIds.filter((id) => valid.has(id));
    if (ids.length === 0) return { ok: true };
    await prisma.$transaction(ids.map((id, idx) => prisma.agendaItem.update({ where: { id }, data: { sequence: idx + 1 } })));
    await audit({ actorId: user.id, action: "reorder", entityType: "Meeting", entityId: meetingId, meetingId, summary: "Reordered agenda items" });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`/meetings/${meetingId}/agenda`);
  return { ok: true };
}

export async function lockAgenda(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const meetingId = getInt(fd, "meetingId");
  if (!meetingId) return { error: "Missing meeting." };
  try {
    assertCan(user, "agenda.draft");
    const now = new Date();
    await prisma.$transaction([
      prisma.meeting.update({
        where: { id: meetingId },
        data: {
          agendaStatus: "Approved"
        }
      }),
      prisma.agendaItem.updateMany({
        where: { meetingId, deletedAt: null, lockedAt: null },
        data: { lockedAt: now }
      })
    ]);
    await audit({ actorId: user.id, action: "lock-agenda", entityType: "Meeting", entityId: meetingId, meetingId, summary: "Locked agenda" });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`/meetings/${meetingId}/agenda`);
  return { ok: true };
}

export async function saveDiscussionNote(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const meetingId = getInt(fd, "meetingId");
  const itemId = getInt(fd, "itemId");
  if (!meetingId || !itemId) return { error: "Missing item." };
  try {
    assertCan(user, "attendance.record");
    await prisma.agendaItem.update({ where: { id: itemId }, data: { discussionNote: getOptStr(fd, "discussionNote") } });
    await audit({ actorId: user.id, action: "note", entityType: "AgendaItem", entityId: itemId, meetingId, summary: "Discussion note recorded" });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`/meetings/${meetingId}/agenda`);
  return { ok: true };
}

// --- Voting on "For Approval" agenda items (resolutions) -------------------

/** Open voting on a For-Approval item and notify directors. */
export async function circulateForVote(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const meetingId = getInt(fd, "meetingId");
  const itemId = getInt(fd, "itemId");
  if (!meetingId || !itemId) return { error: "Missing item." };
  try {
    assertCan(user, "resolutions.manage");
    const item = await prisma.agendaItem.findUnique({ where: { id: itemId } });
    if (!item || item.deletedAt) return { error: "Item not found." };
    if (item.classification !== "ForApproval") return { error: "Only 'For Approval' items can be put to a vote." };
    if (item.votingStatus !== "None") return { error: "This item has already been circulated for voting." };
    await prisma.agendaItem.update({ where: { id: itemId }, data: { votingStatus: "Circulated", circulatedAt: new Date() } });
    const activeUsers = await prisma.user.findMany({ where: { status: "Active", deletedAt: null }, select: { id: true } });
    await audit({ actorId: user.id, action: "circulate", entityType: "AgendaItem", entityId: itemId, meetingId, summary: `Circulated resolution "${item.title}" for voting` });
    await notifyMany(activeUsers.map((u) => u.id), {
      type: "ResolutionCirculated",
      subject: `Resolution open for voting: ${item.title}`,
      body: "A board resolution is open for your vote.",
      relatedEntityType: "AgendaItem",
      relatedEntityId: itemId,
    });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`/meetings/${meetingId}/agenda`);
  revalidatePath("/resolutions");
  return { ok: true };
}

/** A director casts (or changes) their vote while voting is open. */
export async function castVote(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const meetingId = getInt(fd, "meetingId");
  const itemId = getInt(fd, "itemId");
  const choice = getStr(fd, "choice");
  if (!meetingId || !itemId) return { error: "Missing item." };
  try {
    // Only directors/board members (and the secretariat) may vote — roles like
    // Management can attend and read papers but hold no vote. This is the real
    // gate; the caller-supplied canVote prop only hides the buttons.
    assertCan(user, "vote");
    if (!isOneOf(VOTE_CHOICES, choice)) return { error: "Invalid choice." };
    const item = await prisma.agendaItem.findUnique({ where: { id: itemId } });
    if (!item || item.deletedAt) return { error: "Item not found." };
    if (item.votingStatus !== "Circulated") return { error: "Voting is not open for this item." };
    const existing = await prisma.vote.findUnique({ where: { agendaItemId_userId: { agendaItemId: itemId, userId: user.id } } });
    if (existing) {
      await prisma.vote.update({ where: { id: existing.id }, data: { choice, previousChoice: existing.choice, votedAt: new Date() } });
    } else {
      await prisma.vote.create({ data: { agendaItemId: itemId, userId: user.id, choice } });
    }
    // Record participation only — never the choice. Who voted for what is
    // confidential and must not be reconstructable from the audit trail.
    await audit({ actorId: user.id, action: "vote", entityType: "AgendaItem", entityId: itemId, meetingId, summary: existing ? "Updated their vote" : "Cast a vote" });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`/meetings/${meetingId}/agenda`);
  return { ok: true };
}

/** Close voting, tally, and record the pass/fail outcome. */
export async function closeVote(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const meetingId = getInt(fd, "meetingId");
  const itemId = getInt(fd, "itemId");
  if (!meetingId || !itemId) return { error: "Missing item." };
  try {
    assertCan(user, "resolutions.manage");
    const item = await prisma.agendaItem.findUnique({ where: { id: itemId }, include: { votes: true } });
    if (!item || item.deletedAt) return { error: "Item not found." };
    if (item.votingStatus !== "Circulated") return { error: "Only items open for voting can be closed." };
    const tally = tallyVotes(item.votes.map((v) => v.choice as VoteChoice), item.majorityRule as "Simple" | "Special");
    await prisma.agendaItem.update({ where: { id: itemId }, data: { votingStatus: tally.passed ? "Passed" : "Failed", votingClosedAt: new Date() } });
    await audit({ actorId: user.id, action: "close", entityType: "AgendaItem", entityId: itemId, meetingId, summary: `Resolution ${tally.passed ? "PASSED" : "FAILED"} (For ${tally.for}/${tally.cast})` });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`/meetings/${meetingId}/agenda`);
  revalidatePath("/resolutions");
  return { ok: true };
}

/** Withdraw a resolution (For-Approval item) from the vote. */
export async function withdrawVote(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const meetingId = getInt(fd, "meetingId");
  const itemId = getInt(fd, "itemId");
  if (!meetingId || !itemId) return { error: "Missing item." };
  try {
    assertCan(user, "resolutions.manage");
    const item = await prisma.agendaItem.findUnique({ where: { id: itemId } });
    if (!item || item.deletedAt) return { error: "Item not found." };
    await prisma.agendaItem.update({ where: { id: itemId }, data: { votingStatus: "Withdrawn", votingClosedAt: new Date() } });
    await audit({ actorId: user.id, action: "withdraw", entityType: "AgendaItem", entityId: itemId, meetingId, summary: `Resolution "${item.title}" withdrawn` });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`/meetings/${meetingId}/agenda`);
  revalidatePath("/resolutions");
  return { ok: true };
}
