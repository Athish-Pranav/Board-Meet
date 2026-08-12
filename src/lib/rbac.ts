import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser, type SessionUser } from "./auth";

// Permission keys gate server-side actions. Contextual narrowing (e.g. a
// presenter only seeing their own board-pack section) is enforced in queries
// in addition to these coarse gates.
export type Permission =
  | "users.manage"
  | "meetings.create"
  | "meetings.edit"
  | "meetings.approve"
  | "agenda.draft"
  | "agenda.approve"
  | "agenda.propose"
  | "boardpack.publish"
  | "boardpack.view"
  | "documents.manage"
  | "attendance.record"
  | "minutes.draft"
  | "minutes.circulate"
  | "minutes.approve"
  | "minutes.comment"
  | "actions.assign"
  | "actions.create"
  | "resolutions.manage"
  | "vote"
  | "conflicts.declare"
  | "committees.manage"
  | "retention.manage"
  | "settings.manage"
  | "audit.viewAll"
  | "audit.viewOwn";

// Only the system administrator may create or upload content (meetings,
// agenda items, documents, board packs, minutes drafts, committees,
// resolutions, retention policies, settings, user management). Every other
// role is view-only except for a narrow set of personal governance acts that
// belong to the individual, not to an uploader: casting a vote, declaring a
// conflict of interest, commenting on minutes, and the Chairman's
// approve/reject decision on a meeting. Chat messages are handled separately
// in src/lib/chat.ts and are not gated here.
const MATRIX: Record<string, Permission[]> = {
  Chairman: [
    "meetings.approve",
    "agenda.approve",
    "minutes.approve",
    "minutes.comment",
    "boardpack.view",
    "vote",
    "conflicts.declare",
  ],
  ManagingDirector: [
    "meetings.approve",
    "agenda.approve",
    "minutes.approve",
    "minutes.comment",
    "boardpack.view",
    "vote",
    "conflicts.declare",
  ],
  BoardMember: [
    "boardpack.view",
    "minutes.comment",
    "vote",
    "conflicts.declare",
  ],
  Management: ["boardpack.view"],
};

// Superuser roles have full access to every feature (current and future).
// Only the system administrator can create or upload content; every other
// role is view-only plus the narrow personal-governance acts in MATRIX above.
export const SUPERUSER_ROLES = ["CompanySecretary", "CFO"];

export function can(role: string, permission: Permission): boolean {
  if (SUPERUSER_ROLES.includes(role)) return true;
  return MATRIX[role]?.includes(permission) ?? false;
}

/** Returns the logged-in user or redirects to /login. Use at the top of pages. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export class ForbiddenError extends Error {
  constructor(permission: Permission) {
    super(`Forbidden: missing permission "${permission}"`);
    this.name = "ForbiddenError";
  }
}

/** Throws ForbiddenError if the user lacks the permission. For server actions. */
export function assertCan(user: SessionUser, permission: Permission): void {
  if (!can(user.role, permission)) throw new ForbiddenError(permission);
}

/** Page-level guard: redirect to /login, then to /403 if lacking permission. */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) redirect("/403");
  return user;
}

/** Non-redirecting check — usable from both pages and API routes. */
export async function checkCommitteeAccess(user: SessionUser, meeting: { type: string; committeeId: number | null }): Promise<boolean> {
  if (SUPERUSER_ROLES.includes(user.role)) return true;
  if (meeting.type === "Committee" && meeting.committeeId != null) {
    const { prisma } = await import("./db");
    const member = await prisma.committeeMember.findUnique({
      where: {
        committeeId_userId: {
          committeeId: meeting.committeeId,
          userId: user.id
        }
      }
    });
    return Boolean(member);
  }
  return true;
}

/** Page-level guard: redirects to /403 on failure. For server components. */
export async function assertCommitteeAccess(user: SessionUser, meeting: { type: string; committeeId: number | null }): Promise<void> {
  if (!(await checkCommitteeAccess(user, meeting))) redirect("/403");
}
