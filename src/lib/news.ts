// Plain helper (not a server action) — who may post news/shared docs.
// Only the system administrator may post/upload content.
export function canPostNews(role: string): boolean {
  return role === "CompanySecretary" || role === "CFO";
}
