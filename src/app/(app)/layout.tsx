import { requireUser, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { type NavGroup } from "@/components/Nav";
import { TopNav } from "@/components/TopNav";
import { ToastProvider } from "@/components/Toast";
import { CommandPalette, type CommandItem } from "@/components/CommandPalette";
import { LiveVoteNotifier } from "@/components/LiveVoteNotifier";
import { LiveMeetingNotifier } from "@/components/call/LiveMeetingNotifier";
import { ChatWidget } from "@/components/chat/ChatWidget";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  const unread = await prisma.notification.count({
    where: { userId: user.id, channel: "InApp", status: { not: "Read" } },
  });

  const role = user.role;
  const groups: NavGroup[] = [
    {
      label: "Workspace",
      items: [
        { href: "/whats-new", label: "What's New", icon: "bell" },
        { href: "/meetings", label: "Meetings", icon: "calendar" },
        { href: "/calendar", label: "Calendar", icon: "calendar" },
        { href: "/documents", label: "Documents", icon: "folder" },
        { href: "/minutes", label: "Minutes", icon: "minutes" },
        { href: "/action-items", label: "Action Items", icon: "clipboard" },
      ],
    },
    {
      label: "Governance",
      items: [
        { href: "/resolutions", label: "Resolutions", icon: "scale" },
        { href: "/committees", label: "Committees", icon: "users" },
        { href: "/conflicts", label: "Declarations", icon: "flag" },
        ...(role === "CFO" || role === "Chairman" || role === "ManagingDirector" || role === "CompanySecretary"
          ? [{ href: "/compliance", label: "Compliance", icon: "shield" }]
          : []),
      ],
    },
    {
      label: "Insights",
      items: [
        { href: "/news", label: "News", icon: "chat" },
        ...(role === "CFO" || role === "Chairman" || role === "ManagingDirector" || role === "CompanySecretary"
          ? [{ href: "/reports", label: "Reports", icon: "chart" }]
          : []),
        { href: "/assistant", label: "Assistant", icon: "chat" },
      ],
    },
  ];

  const admin: NavGroup = { label: "Admin", items: [] };
  if (can(role, "audit.viewAll") || can(role, "audit.viewOwn")) admin.items.push({ href: "/audit", label: "Audit Log", icon: "shield" });
  if (can(role, "users.manage")) admin.items.push({ href: "/users", label: "Users", icon: "users" });
  if (can(role, "settings.manage") || can(role, "retention.manage")) admin.items.push({ href: "/settings", label: "Settings", icon: "cog" });
  if (admin.items.length) groups.push(admin);

  const commandItems: CommandItem[] = [
    ...(can(role, "meetings.create") ? [{ label: "New meeting", href: "/meetings/new", icon: "calendar", group: "Actions" }] : []),
    { label: "Dashboard", href: "/dashboard", icon: "dashboard", group: "Workspace" },
    ...groups.flatMap((g) => g.items.map((i) => ({ label: i.label, href: i.href, icon: i.icon, group: g.label }))),
  ];

  return (
    <ToastProvider>
      <CommandPalette items={commandItems} />
      <LiveVoteNotifier />
      <LiveMeetingNotifier />
      <ChatWidget me={{ id: user.id, name: user.name, role: user.role }} canCreateGroup={user.role === "CompanySecretary" || user.role === "CFO"} />
      {/* Liquid-glass aurora backdrop */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-cream-100" />
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -left-24 -top-40 h-[34rem] w-[34rem] rounded-full bg-iris-violet/20 blur-[130px] animate-aurora-slow" />
        <div className="absolute -top-32 right-[-8rem] h-[32rem] w-[32rem] rounded-full bg-gold-300/30 blur-[130px] animate-aurora-mid" style={{ animationDelay: "-6s" }} />
        <div className="absolute bottom-[-12rem] left-1/3 h-[36rem] w-[36rem] rounded-full bg-iris-teal/16 blur-[140px] animate-aurora-slow" style={{ animationDelay: "-12s" }} />
        <div className="absolute bottom-[-10rem] right-[-6rem] h-[30rem] w-[30rem] rounded-full bg-brand-400/16 blur-[130px] animate-aurora-mid" style={{ animationDelay: "-3s" }} />
      </div>
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-grid opacity-50" />

      <div className="relative z-10 min-h-screen">
        <TopNav groups={groups} user={user} unread={unread} />
        <main>
          <div className="mx-auto max-w-[1500px] animate-in px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </ToastProvider>
  );
}
