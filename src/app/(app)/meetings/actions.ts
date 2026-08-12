"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { notify, notifyMany, sendNoticeEmail } from "@/lib/notifications";
import { quorumRequired } from "@/lib/compliance";
import { env } from "@/lib/env";
import { getStr, getOptStr, getInt, getBool, getDate, toFormError, type FormResult } from "@/lib/form";
import { saveFile } from "@/lib/storage";
import { createZoomMeeting, updateZoomMeeting, deleteZoomMeeting } from "@/lib/zoom";
import { ATTENDANCE_PRESENT_STATES, MEETING_MODES, MEETING_TYPES, isOneOf } from "@/lib/enums";

async function directorIds(): Promise<number[]> {
  const ds = await prisma.user.findMany({ where: { isDirector: true, deletedAt: null, status: "Active" }, select: { id: true } });
  return ds.map((d) => d.id);
}

async function committeeMemberIds(committeeId: number): Promise<number[]> {
  const ms = await prisma.committeeMember.findMany({ where: { committeeId }, select: { userId: true } });
  return ms.map((m) => m.userId);
}

async function chairmanIds(): Promise<number[]> {
  const cs = await prisma.user.findMany({ where: { role: { in: ["Chairman", "ManagingDirector"] }, deletedAt: null, status: "Active" }, select: { id: true } });
  return cs.map((c) => c.id);
}

/** Emails every active Chairman or Managing Director asking them to approve a newly uploaded meeting. */
async function sendChairmanApprovalRequest(meeting: { id: number; title: string; scheduledAt: Date }): Promise<void> {
  const chairmen = await chairmanIds();
  if (chairmen.length === 0) return;
  const link = `${env.appUrl}/meetings/${meeting.id}`;
  await Promise.all(
    chairmen.map((userId) =>
      notify({
        userId,
        type: "MeetingApprovalRequest",
        channel: "Email",
        subject: `Approval needed: ${meeting.title}`,
        body: `A new meeting "${meeting.title}" scheduled for ${meeting.scheduledAt.toLocaleString("en-IN")} has been uploaded and needs your approval.\n\nReview and approve it here: ${link}`,
        relatedEntityType: "Meeting",
        relatedEntityId: meeting.id,
      }),
    ),
  );
}

const meetingSchema = z.object({
  type: z.enum(MEETING_TYPES),
  title: z.string().min(3, "Title must be at least 3 characters"),
  scheduledAt: z.date({ invalid_type_error: "A valid date & time is required" }),
});

export async function createMeeting(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired — please sign in again." };
  let meetingId: number;
  try {
    assertCan(user, "meetings.create");
    const type = getStr(fd, "type");
    const committeeId = getInt(fd, "committeeId");
    const data = meetingSchema.parse({ type, title: getStr(fd, "title"), scheduledAt: getDate(fd, "scheduledAt") });
    if (data.type === "Committee" && !committeeId) return { error: "Select a committee for a committee meeting." };
    const resolvedMode = isOneOf(MEETING_MODES, getStr(fd, "mode")) ? getStr(fd, "mode") : "Physical";

    let invitees: number[];
    let quorum: number;
    if (data.type === "Committee" && committeeId) {
      invitees = await committeeMemberIds(committeeId);
      quorum = Math.max(Math.ceil(invitees.length / 3), 2);
    } else {
      invitees = await directorIds();
      quorum = quorumRequired(invitees.length);
    }

    // When Zoom's REST API is configured, a Video/Hybrid meeting requires a real
    // Zoom meeting — if the API call fails, the meeting is not created at all,
    // rather than silently saving with no working video link. When Zoom isn't
    // configured, this is skipped entirely and the manually typed meetingLink
    // field (Teams/Webex/etc.) is used as-is — that's a deliberate, unrelated
    // path, not a failure.
    let meetingLink = getOptStr(fd, "meetingLink");
    let zoomMeetingId: string | null = null;
    let zoomPasscode: string | null = null;
    if (resolvedMode !== "Physical" && env.zoom.enabled) {
      const zoomMeeting = await createZoomMeeting({ topic: data.title, startTime: data.scheduledAt });
      if (!zoomMeeting) {
        return { error: "Couldn't create the Zoom meeting, so the meeting was not saved. Check the Zoom integration and try again." };
      }
      meetingLink = zoomMeeting.joinUrl;
      zoomMeetingId = zoomMeeting.zoomMeetingId;
      zoomPasscode = zoomMeeting.passcode;
    }

    const meeting = await prisma.meeting.create({
      data: {
        type: data.type,
        committeeId: data.type === "Committee" ? committeeId : null,
        title: data.title,
        description: getOptStr(fd, "description"),
        scheduledAt: data.scheduledAt,
        venue: getOptStr(fd, "venue"),
        mode: resolvedMode,
        meetingLink,
        zoomMeetingId,
        zoomPasscode,
        status: "Scheduled",
        quorumRequired: quorum,
        createdById: user.id,
        attendance: { create: invitees.map((userId) => ({ userId, status: "Invited" })) },
      },
    });
    meetingId = meeting.id;

    await audit({ actorId: user.id, action: "create", entityType: "Meeting", entityId: meeting.id, meetingId: meeting.id, summary: `Created "${meeting.title}"`, after: meeting });
    await notifyMany(invitees, {
      type: "MeetingInvite",
      subject: `Meeting scheduled: ${meeting.title}`,
      body: `You are invited to "${meeting.title}". Please review the agenda and board pack when published.`,
      relatedEntityType: "Meeting",
      relatedEntityId: meeting.id,
    });
    await sendChairmanApprovalRequest(meeting);
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath("/meetings");
  redirect(`/meetings/${meetingId}`);
}

export async function updateMeeting(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired — please sign in again." };
  const id = getInt(fd, "id");
  if (!id) return { error: "Missing meeting id." };
  try {
    assertCan(user, "meetings.edit");
    const existing = await prisma.meeting.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) return { error: "Meeting not found." };
    const data = meetingSchema.parse({ type: getStr(fd, "type"), title: getStr(fd, "title"), scheduledAt: getDate(fd, "scheduledAt") });
    const newMode = isOneOf(MEETING_MODES, getStr(fd, "mode")) ? getStr(fd, "mode") : existing.mode;
    // Any edit after the Chairman has already weighed in (approved or asked for
    // changes) is treated as a corrected version — it must go back through
    // approval rather than silently keeping the old verdict.
    const needsReapproval = existing.approvalStatus !== "Pending";

    // Zoom sync, keyed off the mode transition:
    let meetingLink = getOptStr(fd, "meetingLink");
    let zoomMeetingId = existing.zoomMeetingId;
    let zoomPasscode = existing.zoomPasscode;
    if (newMode !== "Physical" && !existing.zoomMeetingId && env.zoom.enabled) {
      // Just became a Video/Hybrid meeting — create a fresh Zoom meeting. If
      // Zoom is configured but the call fails, reject the edit rather than
      // silently switching the meeting to Video/Hybrid with no working link
      // (mirrors createMeeting — see the comment there).
      const zoomMeeting = await createZoomMeeting({ topic: data.title, startTime: data.scheduledAt });
      if (!zoomMeeting) {
        return { error: "Couldn't create the Zoom meeting, so the change was not saved. Check the Zoom integration and try again." };
      }
      meetingLink = zoomMeeting.joinUrl;
      zoomMeetingId = zoomMeeting.zoomMeetingId;
      zoomPasscode = zoomMeeting.passcode;
    } else if (newMode !== "Physical" && existing.zoomMeetingId) {
      // Still Video/Hybrid — update the existing Zoom meeting if title/time changed.
      // join_url doesn't change on update, so keep the meeting's existing link.
      meetingLink = existing.meetingLink;
      if (existing.title !== data.title || existing.scheduledAt.getTime() !== data.scheduledAt.getTime()) {
        await updateZoomMeeting(existing.zoomMeetingId, { topic: data.title, startTime: data.scheduledAt });
      }
    } else if (newMode === "Physical" && existing.zoomMeetingId) {
      // No longer needs a Zoom meeting — clean up and clear the link.
      await deleteZoomMeeting(existing.zoomMeetingId);
      meetingLink = null;
      zoomMeetingId = null;
      zoomPasscode = null;
    }

    const updated = await prisma.meeting.update({
      where: { id },
      data: {
        type: data.type,
        title: data.title,
        description: getOptStr(fd, "description"),
        scheduledAt: data.scheduledAt,
        venue: getOptStr(fd, "venue"),
        mode: newMode,
        meetingLink,
        zoomMeetingId,
        zoomPasscode,
        ...(needsReapproval ? { approvalStatus: "Pending", approvalNote: null, approvedAt: null, approvedById: null } : {}),
      },
    });
    await audit({ actorId: user.id, action: "update", entityType: "Meeting", entityId: id, meetingId: id, summary: `Updated "${updated.title}"${needsReapproval ? " — resubmitted for Chairman approval" : ""}`, before: existing, after: updated });

    if (needsReapproval) {
      await sendChairmanApprovalRequest(updated);
    }

    // Auto reschedule alert if the date/time changed.
    if (existing.scheduledAt.getTime() !== data.scheduledAt.getTime()) {
      const attendees = await prisma.attendance.findMany({ where: { meetingId: id }, select: { userId: true } });
      await notifyMany(attendees.map((a) => a.userId), {
        type: "Reschedule",
        channel: "Email",
        subject: `Meeting rescheduled: ${updated.title}`,
        body: `"${updated.title}" has been rescheduled to ${data.scheduledAt.toLocaleString("en-IN")}.`,
        relatedEntityType: "Meeting",
        relatedEntityId: id,
      });
    }
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`/meetings/${id}`);
  redirect(`/meetings/${id}`);
}

/** Pre-defined alert: board papers are available. */
export async function sendPaperAlert(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const id = getInt(fd, "id");
  if (!id) return { error: "Missing meeting id." };
  try {
    assertCan(user, "meetings.edit");
    const meeting = await prisma.meeting.findUnique({ where: { id }, include: { attendance: true } });
    if (!meeting) return { error: "Meeting not found." };
    await notifyMany(meeting.attendance.map((a) => a.userId), {
      type: "PaperAlert",
      channel: "Email",
      subject: `Papers available: ${meeting.title}`,
      body: `Board papers for "${meeting.title}" are available to review ahead of the meeting.`,
      relatedEntityType: "Meeting",
      relatedEntityId: id,
    });
    await audit({ actorId: user.id, action: "paper-alert", entityType: "Meeting", entityId: id, meetingId: id, summary: "Sent paper alert" });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`/meetings/${id}`);
  return { ok: true };
}

/** Pre-defined alert: reschedule (manual re-send). */
export async function sendRescheduleAlert(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const id = getInt(fd, "id");
  if (!id) return { error: "Missing meeting id." };
  try {
    assertCan(user, "meetings.edit");
    const meeting = await prisma.meeting.findUnique({ where: { id }, include: { attendance: true } });
    if (!meeting) return { error: "Meeting not found." };
    await notifyMany(meeting.attendance.map((a) => a.userId), {
      type: "Reschedule",
      channel: "Email",
      subject: `Meeting timing: ${meeting.title}`,
      body: `Reminder — "${meeting.title}" is scheduled for ${meeting.scheduledAt.toLocaleString("en-IN")}.`,
      relatedEntityType: "Meeting",
      relatedEntityId: id,
    });
    await audit({ actorId: user.id, action: "reschedule-alert", entityType: "Meeting", entityId: id, meetingId: id, summary: "Sent reschedule alert" });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`/meetings/${id}`);
  return { ok: true };
}

function parseEmails(str: string | null): string[] {
  if (!str) return [];
  return str
    .split(",")
    .map((e) => e.trim())
    .filter((e) => e.length > 0 && e.includes("@"));
}

export async function sendNotice(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const id = getInt(fd, "id");
  if (!id) return { error: "Missing meeting id." };
  try {
    assertCan(user, "meetings.edit");
    const meeting = await prisma.meeting.findUnique({ where: { id }, include: { attendance: true } });
    if (!meeting) return { error: "Meeting not found." };

    const shortConsent = getBool(fd, "shortNoticeConsent");
    const shortNoticeNote = getOptStr(fd, "shortNoticeNote");

    // Parse emails from form data
    const toStr = getStr(fd, "to");
    if (!toStr) return { error: "At least one recipient (TO) is required." };
    const toEmails = parseEmails(toStr);
    if (toEmails.length === 0) return { error: "At least one valid recipient email is required in TO." };

    const ccStr = getOptStr(fd, "cc");
    const ccEmails = parseEmails(ccStr);

    const bccStr = getOptStr(fd, "bcc");
    const bccEmails = parseEmails(bccStr);

    const subject = getStr(fd, "subject") || `Notice of meeting: ${meeting.title}`;
    const body = getStr(fd, "body") || `Formal notice for "${meeting.title}" on ${meeting.scheduledAt.toLocaleString("en-IN")}.`;

    // Process file uploads
    const files = fd.getAll("attachments");
    const attachments: { filename: string; content: Buffer; contentType: string }[] = [];

    for (const file of files) {
      if (file instanceof File && file.size > 0) {
        if (file.size > 24 * 1024 * 1024) {
          return { error: `File "${file.name}" exceeds the 24 MB limit.` };
        }
        const bytes = Buffer.from(await file.arrayBuffer());
        const stored = await saveFile(bytes, file.name);

        // Register document in db, link it to the meeting
        const doc = await prisma.document.create({
          data: {
            title: file.name,
            meetingId: id,
            classification: "Internal",
            storageKey: stored.storageKey,
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            sizeBytes: stored.sizeBytes,
            uploadedById: user.id,
          },
        });

        attachments.push({
          filename: file.name,
          content: bytes,
          contentType: file.type || "application/octet-stream",
        });

        await audit({
          actorId: user.id,
          action: "create",
          entityType: "Document",
          entityId: doc.id,
          meetingId: id,
          summary: `Uploaded attachment "${file.name}" for notice`,
        });
      }
    }

    // Update meeting notice state
    const updated = await prisma.meeting.update({
      where: { id },
      data: {
        noticeSentAt: new Date(),
        shortNoticeConsent: shortConsent,
        shortNoticeNote: shortConsent ? shortNoticeNote : null,
      },
    });

    await audit({ actorId: user.id, action: "notice", entityType: "Meeting", entityId: id, meetingId: id, summary: "Notice issued to directors" });

    // Send email via SMTP or log it
    await sendNoticeEmail({
      to: toEmails,
      cc: ccEmails,
      bcc: bccEmails,
      subject,
      body,
      attachments,
    });

    // Find matching users in DB to create in-app notifications
    const allEmails = [...new Set([...toEmails, ...ccEmails, ...bccEmails])];
    const systemUsers = await prisma.user.findMany({
      where: { email: { in: allEmails }, deletedAt: null },
      select: { id: true },
    });

    if (systemUsers.length > 0) {
      await prisma.notification.createMany({
        data: systemUsers.map((u) => ({
          userId: u.id,
          type: "MeetingInvite",
          channel: "Email",
          subject,
          body,
          status: "Sent",
          sentAt: new Date(),
          relatedEntityType: "Meeting",
          relatedEntityId: id,
        })),
      });
    }

    void updated;
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`/meetings/${id}`);
  return { ok: true };
}

export async function startSession(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const id = getInt(fd, "id");
  if (!id) return { error: "Missing meeting id." };
  try {
    assertCan(user, "meetings.edit");
    const meeting = await prisma.meeting.findUnique({
      where: { id },
      include: { attendance: { include: { user: { select: { isDirector: true } } } } },
    });
    if (!meeting) return { error: "Meeting not found." };
    const presentDirectors = meeting.attendance.filter(
      (a) => a.user.isDirector && ATTENDANCE_PRESENT_STATES.includes(a.status as never),
    ).length;
    if (presentDirectors < meeting.quorumRequired) {
      return { error: `Quorum not met (s.174): ${presentDirectors} of required ${meeting.quorumRequired} directors present. Mark attendance before starting.` };
    }
    await prisma.meeting.update({ where: { id }, data: { status: "InSession", startedAt: new Date(), quorumMet: true } });
    await audit({ actorId: user.id, action: "start", entityType: "Meeting", entityId: id, meetingId: id, summary: `Meeting in session — quorum ${presentDirectors}/${meeting.quorumRequired}` });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`/meetings/${id}`);
  revalidatePath(`/meetings/${id}/room`);
  return { ok: true };
}

/** Chairman sign-off on a newly uploaded meeting (triggered from the approval email). */
export async function approveMeeting(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const id = getInt(fd, "id");
  if (!id) return { error: "Missing meeting id." };
  try {
    assertCan(user, "meetings.approve");
    const meeting = await prisma.meeting.findUnique({ where: { id } });
    if (!meeting || meeting.deletedAt) return { error: "Meeting not found." };
    await prisma.meeting.update({
      where: { id },
      data: { approvalStatus: "Approved", approvedAt: new Date(), approvedById: user.id, approvalNote: getOptStr(fd, "note") },
    });
    await audit({ actorId: user.id, action: "approve", entityType: "Meeting", entityId: id, meetingId: id, summary: `Approved "${meeting.title}"` });
    await notify({
      userId: meeting.createdById,
      type: "MeetingApproved",
      subject: `Approved: ${meeting.title}`,
      body: `${user.name} approved "${meeting.title}".`,
      relatedEntityType: "Meeting",
      relatedEntityId: id,
    });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`/meetings/${id}`);
  return { ok: true };
}

export async function rejectMeeting(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const id = getInt(fd, "id");
  if (!id) return { error: "Missing meeting id." };
  try {
    assertCan(user, "meetings.approve");
    const meeting = await prisma.meeting.findUnique({ where: { id } });
    if (!meeting || meeting.deletedAt) return { error: "Meeting not found." };
    const note = getOptStr(fd, "note");
    await prisma.meeting.update({
      where: { id },
      data: { approvalStatus: "Rejected", approvedAt: new Date(), approvedById: user.id, approvalNote: note },
    });
    await audit({ actorId: user.id, action: "reject", entityType: "Meeting", entityId: id, meetingId: id, summary: `Rejected "${meeting.title}"` });
    await notify({
      userId: meeting.createdById,
      type: "MeetingRejected",
      channel: "Email",
      subject: `Changes requested: ${meeting.title}`,
      body: `${user.name} did not approve "${meeting.title}".${note ? ` Note: ${note}` : ""}`,
      relatedEntityType: "Meeting",
      relatedEntityId: id,
    });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`/meetings/${id}`);
  return { ok: true };
}

export async function concludeMeeting(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const id = getInt(fd, "id");
  if (!id) return { error: "Missing meeting id." };
  try {
    assertCan(user, "meetings.edit");
    const meeting = await prisma.meeting.findUnique({ where: { id }, include: { minutes: true } });
    if (!meeting) return { error: "Meeting not found." };
    await prisma.meeting.update({ where: { id }, data: { status: "Concluded", endedAt: new Date() } });
    // Open a minutes draft so the s.118 30-day clock has somewhere to land.
    if (!meeting.minutes) {
      await prisma.minutes.create({ data: { meetingId: id, status: "Draft", content: "" } });
    }
    await audit({ actorId: user.id, action: "conclude", entityType: "Meeting", entityId: id, meetingId: id, summary: "Meeting concluded" });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath(`/meetings/${id}`);
  revalidatePath(`/meetings/${id}/room`);
  return { ok: true };
}

export async function cancelMeeting(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const id = getInt(fd, "id");
  if (!id) return { error: "Missing meeting id." };
  try {
    assertCan(user, "meetings.edit");
    const meeting = await prisma.meeting.findUnique({ where: { id } });
    if (!meeting) return { error: "Meeting not found." };
    if (meeting.zoomMeetingId) await deleteZoomMeeting(meeting.zoomMeetingId); // best-effort
    await prisma.meeting.update({ where: { id }, data: { status: "Cancelled", deletedAt: new Date() } });
    await audit({ actorId: user.id, action: "cancel", entityType: "Meeting", entityId: id, meetingId: id, summary: `Cancelled "${meeting.title}"` });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath("/meetings");
  redirect("/meetings");
}
