"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser, hashPassword } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { getInt, getStr, getOptStr, getBool, toFormError, type FormResult } from "@/lib/form";
import { ROLES, USER_STATUS, isOneOf } from "@/lib/enums";

const baseSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Valid email required"),
  role: z.enum(ROLES),
});

export async function createUser(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  try {
    assertCan(user, "users.manage");
    const data = baseSchema.parse({ name: getStr(fd, "name"), email: getStr(fd, "email").toLowerCase(), role: getStr(fd, "role") });
    const password = getStr(fd, "password");
    if (password.length < 8) return { error: "Password must be at least 8 characters." };
    const exists = await prisma.user.findUnique({ where: { email: data.email } });
    if (exists) return { error: "A user with that email already exists." };
    const created = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        role: data.role,
        designation: getOptStr(fd, "designation"),
        isDirector: getBool(fd, "isDirector"),
        passwordHash: await hashPassword(password),
        status: "Active",
      },
    });
    await audit({ actorId: user.id, action: "create", entityType: "User", entityId: created.id, summary: `Created user ${created.email} (${created.role})` });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath("/users");
  return { ok: true };
}

export async function updateUser(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const id = getInt(fd, "id");
  if (!id) return { error: "Missing user." };
  try {
    assertCan(user, "users.manage");
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return { error: "User not found." };
    const role = getStr(fd, "role");
    const status = getStr(fd, "status");
    
    const email = getStr(fd, "email").trim().toLowerCase();
    if (!email) return { error: "Email is required." };
    if (!z.string().email().safeParse(email).success) {
      return { error: "A valid email is required." };
    }
    if (email !== existing.email) {
      const emailExists = await prisma.user.findUnique({ where: { email } });
      if (emailExists && emailExists.id !== id) {
        return { error: "A user with that email already exists." };
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        name: getStr(fd, "name") || existing.name,
        email,
        designation: getOptStr(fd, "designation"),
        role: isOneOf(ROLES, role) ? role : existing.role,
        status: isOneOf(USER_STATUS, status) ? status : existing.status,
        isDirector: getBool(fd, "isDirector"),
      },
    });
    await audit({
      actorId: user.id,
      action: "update",
      entityType: "User",
      entityId: id,
      summary: `Updated ${updated.email}`,
      before: { email: existing.email, role: existing.role, status: existing.status, isDirector: existing.isDirector },
      after: { email: updated.email, role: updated.role, status: updated.status, isDirector: updated.isDirector },
    });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath("/users");
  return { ok: true };
}

export async function deleteUser(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const id = getInt(fd, "id");
  if (!id) return { error: "Missing user." };
  try {
    assertCan(user, "users.manage");
    if (id === user.id) return { error: "You cannot remove your own account." };
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) return { error: "User not found." };
    if (existing.role === "CompanySecretary" || existing.role === "CFO") {
      const otherSuperusers = await prisma.user.count({
        where: { role: { in: ["CompanySecretary", "CFO"] }, status: "Active", deletedAt: null, id: { not: id } },
      });
      if (otherSuperusers === 0) return { error: "Cannot remove the last active Company Secretary or CFO." };
    }
    // Soft-delete (record retained) and revoke any active sessions immediately.
    await prisma.user.update({ where: { id }, data: { deletedAt: new Date(), status: "Inactive" } });
    await prisma.session.deleteMany({ where: { userId: id } });
    await audit({ actorId: user.id, action: "delete", entityType: "User", entityId: id, summary: `Removed user ${existing.email}` });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath("/users");
  return { ok: true };
}

export async function resetPassword(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expired." };
  const id = getInt(fd, "id");
  if (!id) return { error: "Missing user." };
  try {
    assertCan(user, "users.manage");
    const password = getStr(fd, "password");
    if (password.length < 8) return { error: "Password must be at least 8 characters." };
    await prisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(password) } });
    // Invalidate existing sessions for that user.
    await prisma.session.deleteMany({ where: { userId: id } });
    await audit({ actorId: user.id, action: "reset-password", entityType: "User", entityId: id, summary: "Reset password & revoked sessions" });
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath("/users");
  return { ok: true };
}
