import "server-only";
import { prisma } from "./db";

/** Only admins / company secretaries may create group chats. */
export function canCreateGroup(role: string): boolean {
  return role === "CompanySecretary" || role === "CFO";
}

export async function membership(conversationId: number, userId: number) {
  return prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId, userId } } });
}
