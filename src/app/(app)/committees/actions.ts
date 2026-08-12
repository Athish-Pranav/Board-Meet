"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { getInt, getStr, getOptStr, toFormError, type FormResult } from "@/lib/form";
import { COMMITTEE_TYPES, isOneOf } from "@/lib/enums";

export async function createCommittee(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  let id: number;
  try {
    assertCan(user, "committees.manage");
    const name = z.string().min(2, "Committee name is required").parse(getStr(fd, "name"));
    const type = getStr(fd, "type");
    const c = await prisma.committee.create({
      data: { name, type: isOneOf(COMMITTEE_TYPES, type) ? type : "Other", description: getOptStr(fd, "description") },
    });
    id = c.id;
    await audit({ actorId: user.id, action: "create", entityType: "Committee", entityId: c.id, summary: `Created ${name}` });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath("/committees");
  redirect(`/committees/${id}`);
}

export async function addMember(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const committeeId = getInt(fd, "committeeId");
  const userId = getInt(fd, "userId");
  if (!committeeId || !userId) return { error: "Select a member." };
  try {
    assertCan(user, "committees.manage");
    const exists = await prisma.committeeMember.findUnique({ where: { committeeId_userId: { committeeId, userId } } });
    if (exists) return { error: "Already a member." };
    await prisma.committeeMember.create({ data: { committeeId, userId, role: getStr(fd, "role") === "Chair" ? "Chair" : "Member" } });
    await audit({ actorId: user.id, action: "add-member", entityType: "Committee", entityId: committeeId, summary: "Added committee member" });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`/committees/${committeeId}`);
  return { ok: true };
}

export async function removeMember(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const committeeId = getInt(fd, "committeeId");
  const memberId = getInt(fd, "memberId");
  if (!committeeId || !memberId) return { error: "Missing member." };
  try {
    assertCan(user, "committees.manage");
    await prisma.committeeMember.delete({ where: { id: memberId } });
    await audit({ actorId: user.id, action: "remove-member", entityType: "Committee", entityId: committeeId, summary: "Removed committee member" });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`/committees/${committeeId}`);
  return { ok: true };
}

export async function updateCommittee(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const id = getInt(fd, "id");
  if (!id) return { error: "Missing committee ID." };
  try {
    assertCan(user, "committees.manage");
    const name = z.string().min(2, "Committee name is required").parse(getStr(fd, "name"));
    const type = getStr(fd, "type");
    const description = getOptStr(fd, "description");
    await prisma.committee.update({
      where: { id },
      data: {
        name,
        type: isOneOf(COMMITTEE_TYPES, type) ? type : "Other",
        description,
      },
    });
    await audit({ actorId: user.id, action: "update", entityType: "Committee", entityId: id, summary: `Updated committee ${name}` });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath("/committees");
  revalidatePath(`/committees/${id}`);
  return { ok: true };
}

export async function updateMemberRole(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const committeeId = getInt(fd, "committeeId");
  const memberId = getInt(fd, "memberId");
  const role = getStr(fd, "role") === "Chair" ? "Chair" : "Member";
  if (!committeeId || !memberId) return { error: "Missing member information." };
  try {
    assertCan(user, "committees.manage");
    await prisma.committeeMember.update({
      where: { id: memberId },
      data: { role },
    });
    await audit({
      actorId: user.id,
      action: "update-member-role",
      entityType: "Committee",
      entityId: committeeId,
      summary: `Updated member role to ${role}`,
    });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`/committees/${committeeId}`);
  return { ok: true };
}

export async function deleteCommittee(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const id = getInt(fd, "id");
  if (!id) return { error: "Missing committee ID." };
  try {
    assertCan(user, "committees.manage");
    await prisma.committee.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await audit({ actorId: user.id, action: "delete", entityType: "Committee", entityId: id, summary: `Deleted committee ID ${id}` });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath("/committees");
  redirect("/committees");
}
