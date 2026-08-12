import { requireUser } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { fmtRelative } from "@/lib/format";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { markRead, markAllRead } from "./actions";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requireUser();
  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const unread = notifications.filter((n) => n.status !== "Read").length;

  return (
    <div>
      <PageHeader
        title="Notifications"
        description={unread ? `${unread} unread` : "You're all caught up."}
        actions={
          unread ? (
            <ActionForm action={markAllRead} submitLabel="Mark all read" submitVariant="secondary" className="!space-y-0" />
          ) : null
        }
      />

      {notifications.length === 0 ? (
        <EmptyState title="No notifications" hint="Meeting invites, board-pack and action-item alerts will appear here." />
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <Card key={n.id} className={`flex items-start justify-between gap-3 p-4 ${n.status !== "Read" ? "border-brand-200 bg-brand-50/40" : ""}`}>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-slate-800">{n.subject}</p>
                  <Badge tone="gray">{n.type}</Badge>
                  {n.channel === "Email" ? <Badge tone="blue">Email</Badge> : null}
                </div>
                <p className="mt-0.5 text-sm text-slate-600">{n.body}</p>
                <p className="mt-1 text-xs text-slate-400">{fmtRelative(n.createdAt)}</p>
              </div>
              {n.status !== "Read" ? (
                <ActionForm action={markRead} className="!space-y-0">
                  <input type="hidden" name="id" value={n.id} />
                  <button className="btn-secondary btn-sm">Mark read</button>
                </ActionForm>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
