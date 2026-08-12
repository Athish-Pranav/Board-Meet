import "server-only";
import { prisma } from "./db";

type AuditInput = {
  actorId?: number | null;
  action: string; // create | update | delete | publish | approve | vote | login | logout | ...
  entityType: string;
  entityId?: number | null;
  meetingId?: number | null;
  summary?: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
};

function serialize(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  try {
    const json = JSON.stringify(value, (_k, v) => (v instanceof Date ? v.toISOString() : v));
    // Guard against oversized payloads in the audit table.
    return json.length > 8000 ? json.slice(0, 8000) + "…(truncated)" : json;
  } catch {
    return String(value);
  }
}

/**
 * Records an immutable audit entry. Every write in the app should call this.
 * Best-effort: never let an audit failure break the primary operation, but log it.
 */
export async function audit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        meetingId: input.meetingId ?? null,
        summary: input.summary ?? null,
        before: serialize(input.before),
        after: serialize(input.after),
        ip: input.ip ?? null,
      },
    });
  } catch (err) {
    console.error("[audit] failed to write audit log:", err);
  }
}
