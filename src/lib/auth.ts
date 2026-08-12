import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { env } from "./env";

const COOKIE_NAME = "bm_session";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string | null): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

export async function createSession(userId: number): Promise<void> {
  const token = crypto.randomBytes(48).toString("base64url");
  const expiresAt = new Date(Date.now() + env.sessionTtlHours * 3600 * 1000);
  await prisma.session.create({ data: { token, userId, expiresAt } });
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { token } });
    cookies().delete(COOKIE_NAME);
  }
}

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  designation: string | null;
  isDirector: boolean;
  status: string;
};

// Cached per request — safe to call in many server components.
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  const u = session.user;
  if (u.deletedAt || u.status !== "Active") return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    designation: u.designation,
    isDirector: u.isDirector,
    status: u.status,
  };
});
