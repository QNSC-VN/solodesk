import type { ReactNode } from "react";
import type { Notification } from "@/lib/notifications";
import type { SessionUser } from "@/lib/auth";
import { logoutAction } from "@/app/actions";
import { NotificationBell } from "./NotificationBell";

const NAV_LINKS = [
  { href: "/", label: "Đơn hàng" },
  // Invoices/stock pages reuse this exact shell + DataTable later — not
  // built in this first cut, see design-system/solodesk/pages/web-accounting.md.
];

export interface DashboardShellProps {
  user: SessionUser;
  notifications: Notification[];
  unreadCount: number;
  children: ReactNode;
}

/**
 * The one layout component every authenticated page renders inside.
 * `data-dense-dashboard`'s structural values: `--header-height`,
 * `--sidebar-width` (see design-system/solodesk/pages/web-accounting.md).
 * Header stays sticky; content gets `padding-top` compensation per
 * Master's own Sticky Navigation guidance (never let a fixed nav overlap
 * content).
 */
export function DashboardShell({ user, notifications, unreadCount, children }: DashboardShellProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <header
        className="fixed inset-x-0 top-0 z-30 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-card)] px-4"
        style={{ height: "var(--header-height)" }}
      >
        <span className="font-[family-name:var(--font-heading)] text-lg font-bold text-[var(--color-primary)]">SoloDesk</span>
        <div className="flex items-center gap-3">
          <NotificationBell notifications={notifications} unreadCount={unreadCount} />
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-[var(--color-foreground)] sm:inline">{user.displayName}</span>
            <form action={logoutAction}>
              <button type="submit" className="cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium text-[var(--color-muted-foreground)] transition-colors duration-150 hover:bg-[var(--color-muted)]">
                Đăng xuất
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="flex flex-1" style={{ paddingTop: "var(--header-height)" }}>
        <nav
          className="hidden shrink-0 border-r border-[var(--color-border)] bg-[var(--color-card)] p-3 md:block"
          style={{ width: "var(--sidebar-width)" }}
        >
          <ul className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="block rounded-md px-3 py-2 text-sm font-medium text-[var(--color-foreground)] transition-colors duration-150 hover:bg-[var(--color-muted)]"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
