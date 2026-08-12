import "server-only";
import type { SessionUser } from "./auth";

// Roles that can always view a meeting's room (agenda + board pack + voting +
// Zoom join link), regardless of the attendance list (secretariat/chair/
// leadership + directors always have visibility). Mirrors the room page's
// document-confidentiality gate.
export const CALL_ELEVATED_ROLES = ["CompanySecretary", "CFO", "Chairman", "ManagingDirector"];

export function canAlwaysJoinCall(user: SessionUser): boolean {
  return CALL_ELEVATED_ROLES.includes(user.role) || user.role === "BoardMember" || user.isDirector;
}
