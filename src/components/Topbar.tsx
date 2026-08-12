import Link from "next/link";
import { Icon } from "./icons";
import { UserMenu } from "./UserMenu";
import { CommandTrigger } from "./CommandPalette";
import type { SessionUser } from "@/lib/auth";

export function Topbar({ user, unread }: { user: SessionUser; unread: number }) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-cream-300 bg-cream-50/85 px-5 backdrop-blur-md sm:px-6">
      <div className="flex flex-1 items-center gap-3">
        <Link href="/dashboard" className="md:hidden flex items-center">
          <img src="/logo.png" alt="Precot Logo" className="h-6 w-auto" />
        </Link>
        <CommandTrigger />
      </div>

      <div className="flex items-center gap-1.5">
        <Link href="/assistant" className="hidden rounded-xl px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 sm:inline-flex sm:items-center sm:gap-1.5">
          <Icon name="chat" className="h-4 w-4" /> Ask
        </Link>
        <Link href="/notifications" className="relative rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800" aria-label="Notifications">
          <Icon name="bell" />
          {unread > 0 ? (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Link>
        <div className="mx-1 h-6 w-px bg-slate-200" />
        <UserMenu name={user.name} email={user.email} role={user.role} />
      </div>
    </header>
  );
}
