"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession, verifyPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { checkLoginLockout, recordFailedLogin, clearLoginAttempts } from "@/lib/rateLimit";
import type { FormResult } from "@/components/ActionForm";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export async function loginAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const parsed = schema.safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const email = parsed.data.email;
  const lockout = checkLoginLockout(email);
  if (lockout.locked) {
    const minutes = Math.ceil(lockout.retryAfterMs / 60000);
    return { error: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const ok = user && !user.deletedAt && user.status === "Active" && (await verifyPassword(parsed.data.password, user.passwordHash));
  if (!user || !ok) {
    recordFailedLogin(email);
    return { error: "Invalid email or password." };
  }
  clearLoginAttempts(email);

  await createSession(user.id);
  await audit({ actorId: user.id, action: "login", entityType: "User", entityId: user.id, summary: `${user.name} signed in` });
  redirect("/dashboard");
}
