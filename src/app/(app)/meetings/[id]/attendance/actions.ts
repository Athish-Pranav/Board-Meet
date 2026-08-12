"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { getInt, getStr, getBool, toFormError, type FormResult } from "@/lib/form";
import { ATTENDANCE_STATUS, ATTENDANCE_PRESENT_STATES, isOneOf } from "@/lib/enums";

async function recomputeQuorum(meetingId: number) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: { attendance: { include: { user: { select: { isDirector: true } } } } },
  });
  if (!meeting) return;
  const present = meeting.attendance.filter((a) => a.user.isDirector && ATTENDANCE_PRESENT_STATES.includes(a.status as never)).length;
  await prisma.meeting.update({ where: { id: meetingId }, data: { quorumMet: present >= meeting.quorumRequired } });
}

export async function setAttendance(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const meetingId = getInt(fd, "meetingId");
  const attendanceId = getInt(fd, "attendanceId");
  const userId = getInt(fd, "userId");
  const status = getStr(fd, "status");
  if (!meetingId) return { error: "Missing meeting id." };
  if (!attendanceId && !userId) return { error: "Missing attendance row or user." };
  try {
    assertCan(user, "attendance.record");
    if (!isOneOf(ATTENDANCE_STATUS, status)) return { error: "Invalid status." };
    
    let existing = null;
    if (attendanceId) {
      existing = await prisma.attendance.findUnique({ where: { id: attendanceId }, include: { user: { select: { name: true } } } });
    } else if (userId) {
      existing = await prisma.attendance.findUnique({ where: { meetingId_userId: { meetingId, userId } }, include: { user: { select: { name: true } } } });
    }

    let savedId = attendanceId;
    let name = "";
    if (existing) {
      await prisma.attendance.update({
        where: { id: existing.id },
        data: { status, joinedAt: ATTENDANCE_PRESENT_STATES.includes(status as never) ? existing.joinedAt ?? new Date() : null },
      });
      savedId = existing.id;
      name = existing.user.name;
    } else if (userId) {
      const dbUser = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
      if (!dbUser) return { error: "User not found." };
      const created = await prisma.attendance.create({
        data: {
          meetingId,
          userId,
          status,
          joinedAt: ATTENDANCE_PRESENT_STATES.includes(status as never) ? new Date() : null,
        },
      });
      savedId = created.id;
      name = dbUser.name;
    }

    await recomputeQuorum(meetingId);
    await audit({ actorId: user.id, action: "attendance", entityType: "Attendance", entityId: savedId!, meetingId, summary: `${name}: ${status}` });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`/meetings/${meetingId}/attendance`);
  revalidatePath(`/meetings/${meetingId}`);
  return { ok: true };
}

export async function togglePresenter(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const meetingId = getInt(fd, "meetingId");
  const attendanceId = getInt(fd, "attendanceId");
  const userId = getInt(fd, "userId");
  if (!meetingId) return { error: "Missing meeting id." };
  if (!attendanceId && !userId) return { error: "Missing row." };
  try {
    assertCan(user, "attendance.record");
    
    let existing = null;
    if (attendanceId) {
      existing = await prisma.attendance.findUnique({ where: { id: attendanceId } });
    } else if (userId) {
      existing = await prisma.attendance.findUnique({ where: { meetingId_userId: { meetingId, userId } } });
    }

    if (existing) {
      await prisma.attendance.update({ where: { id: existing.id }, data: { isPresenter: !existing.isPresenter } });
    } else if (userId) {
      await prisma.attendance.create({
        data: {
          meetingId,
          userId,
          status: "Invited",
          isPresenter: true,
        },
      });
    }
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`/meetings/${meetingId}/attendance`);
  return { ok: true };
}

export async function addAttendee(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const meetingId = getInt(fd, "meetingId");
  const userId = getInt(fd, "userId");
  if (!meetingId || !userId) return { error: "Select a person to invite." };
  try {
    assertCan(user, "attendance.record");
    const existing = await prisma.attendance.findUnique({ where: { meetingId_userId: { meetingId, userId } } });
    if (existing) return { error: "Already invited." };
    await prisma.attendance.create({ data: { meetingId, userId, status: "Invited", isPresenter: getBool(fd, "isPresenter") } });
    await audit({ actorId: user.id, action: "invite", entityType: "Attendance", meetingId, entityId: userId, summary: "Added attendee" });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`/meetings/${meetingId}/attendance`);
  return { ok: true };
}
