"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { assertCan, can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { notify, notifyMany } from "@/lib/notifications";
import { getInt, getStr, getDate, getOptStr, toFormError, type FormResult } from "@/lib/form";
import { ACTION_STATUS, isOneOf } from "@/lib/enums";
import { differenceInCalendarDays } from "date-fns";

export async function createActionItem(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  try {
    assertCan(user, "actions.create");
    const data = z
      .object({ title: z.string().min(2, "Title is required"), assigneeId: z.number({ invalid_type_error: "Choose an assignee" }), dueDate: z.date({ invalid_type_error: "A due date is required" }) })
      .parse({ title: getStr(fd, "title"), assigneeId: getInt(fd, "assigneeId"), dueDate: getDate(fd, "dueDate") });

    const item = await prisma.actionItem.create({
      data: {
        title: data.title,
        description: getOptStr(fd, "description"),
        assigneeId: data.assigneeId,
        dueDate: data.dueDate,
        meetingId: getInt(fd, "meetingId"),
        sourceMinutesId: getInt(fd, "sourceMinutesId"),
        sourceAgendaItemId: getInt(fd, "sourceAgendaItemId"),
        status: "Open",
        createdById: user.id,
      },
    });
    await audit({ actorId: user.id, action: "create", entityType: "ActionItem", entityId: item.id, meetingId: item.meetingId, summary: `Assigned action "${data.title}"` });
    await notify({ userId: data.assigneeId, type: "ActionDue", subject: "New action item assigned to you", body: `"${data.title}" — due ${data.dueDate.toDateString()}.`, relatedEntityType: "ActionItem", relatedEntityId: item.id });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath("/action-items");
  return { ok: true };
}

export async function updateActionStatus(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const itemId = getInt(fd, "itemId");
  const status = getStr(fd, "status");
  if (!itemId) return { error: "Missing item." };
  try {
    const item = await prisma.actionItem.findUnique({ where: { id: itemId } });
    if (!item || item.deletedAt) return { error: "Not found." };
    // Assignee can update their own item; otherwise need assign permission.
    if (item.assigneeId !== user.id && !can(user.role, "actions.assign")) {
      return { error: "Only the assignee or the secretariat can update this item." };
    }
    if (!isOneOf(ACTION_STATUS, status)) return { error: "Invalid status." };
    await prisma.actionItem.update({
      where: { id: itemId },
      data: { status, completedAt: status === "Done" ? new Date() : null },
    });
    await audit({ actorId: user.id, action: "update", entityType: "ActionItem", entityId: itemId, meetingId: item.meetingId, summary: `Action status → ${status}` });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath("/action-items");
  return { ok: true };
}

export async function reassignAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const itemId = getInt(fd, "itemId");
  const assigneeId = getInt(fd, "assigneeId");
  if (!itemId || !assigneeId) return { error: "Missing data." };
  try {
    assertCan(user, "actions.assign");
    await prisma.actionItem.update({ where: { id: itemId }, data: { assigneeId, escalatedAt: null, reminderSentAt: null } });
    await audit({ actorId: user.id, action: "reassign", entityType: "ActionItem", entityId: itemId, summary: "Reassigned action item" });
    await notify({ userId: assigneeId, type: "ActionDue", subject: "An action item was reassigned to you", body: "You have a new action item. See the action tracker.", relatedEntityType: "ActionItem", relatedEntityId: itemId });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath("/action-items");
  return { ok: true };
}

/**
 * Escalation pass (spec 6.7): remind assignee + CS at T-3 days; escalate to the
 * Chairman if overdue by > 7 days. Run on demand here; wire to a cron in prod.
 */
export async function runEscalations(_prev: FormResult, _fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  let reminded = 0;
  let escalated = 0;
  try {
    assertCan(user, "actions.assign");
    const now = new Date();
    const open = await prisma.actionItem.findMany({ where: { deletedAt: null, status: { not: "Done" } } });
    const secretaries = await prisma.user.findMany({ where: { role: "CompanySecretary", status: "Active", deletedAt: null }, select: { id: true } });
    const chairs = await prisma.user.findMany({ where: { role: { in: ["Chairman", "ManagingDirector"] }, status: "Active", deletedAt: null }, select: { id: true } });

    for (const item of open) {
      const daysToDue = differenceInCalendarDays(item.dueDate, now);
      // Mark overdue
      if (daysToDue < 0 && item.status !== "Overdue") {
        await prisma.actionItem.update({ where: { id: item.id }, data: { status: "Overdue" } });
      }
      // T-3 reminder
      if (daysToDue <= 3 && daysToDue >= 0 && !item.reminderSentAt) {
        await notifyMany([item.assigneeId, ...secretaries.map((s) => s.id)], { type: "ActionDue", subject: "Action item due soon", body: `"${item.title}" is due in ${daysToDue} day(s).`, relatedEntityType: "ActionItem", relatedEntityId: item.id });
        await prisma.actionItem.update({ where: { id: item.id }, data: { reminderSentAt: now } });
        reminded++;
      }
      // Escalate > 7 days overdue
      if (daysToDue < -7 && !item.escalatedAt) {
        await notifyMany(chairs.map((c) => c.id), { type: "Escalation", subject: "Overdue action item escalated", body: `"${item.title}" is overdue by ${Math.abs(daysToDue)} days.`, relatedEntityType: "ActionItem", relatedEntityId: item.id });
        await prisma.actionItem.update({ where: { id: item.id }, data: { escalatedAt: now } });
        escalated++;
      }
    }
    await audit({ actorId: user.id, action: "escalate", entityType: "ActionItem", summary: `Escalation pass: ${reminded} reminders, ${escalated} escalations` });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath("/action-items");
  return { ok: true };
}
