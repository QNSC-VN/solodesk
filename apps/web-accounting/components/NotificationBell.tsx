"use client";

import { useState, useTransition } from "react";
import type { Notification } from "@/lib/notifications";
import { markNotificationReadAction, markAllNotificationsReadAction } from "@/app/actions";

export interface NotificationBellProps {
  notifications: Notification[];
  unreadCount: number;
}

/**
 * Unread badge (Master's `.badge` classes, `role="status"`/`aria-atomic`
 * per its own async-badge rule) + dropdown. No SSE/polling — see
 * design-system/solodesk/pages/web-accounting.md's "Scope" note: a plain
 * fetch-on-page-load is the right MVP shape for this audience; the count
 * updates on next navigation/`revalidatePath` after a mark-read action, not
 * live in the background.
 */
export function NotificationBell({ notifications, unreadCount }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Thông báo, ${unreadCount} chưa đọc`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-[var(--color-foreground)] transition-colors duration-150 hover:bg-[var(--color-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)]"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {unreadCount > 0 && (
          <span role="status" aria-atomic="true" className="badge badge-error absolute -top-1 -right-1 min-w-5 justify-center px-1.5 py-0">
            <span className="badge-text">{unreadCount > 9 ? "9+" : unreadCount}</span>
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-lg">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2">
            <span className="font-[family-name:var(--font-heading)] font-semibold text-sm">Thông báo</span>
            {unreadCount > 0 && (
              <button
                type="button"
                disabled={isPending}
                onClick={() => startTransition(() => markAllNotificationsReadAction())}
                className="cursor-pointer text-xs font-medium text-[var(--color-primary)] hover:underline disabled:opacity-50"
              >
                Đánh dấu tất cả đã đọc
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {notifications.length === 0 && <li className="px-4 py-6 text-center text-sm text-[var(--color-muted-foreground)]">Không có thông báo nào.</li>}
            {notifications.map((n) => (
              <li key={n.id} className={`border-b border-[var(--color-border)] px-4 py-3 last:border-b-0 ${n.isRead ? "" : "bg-[var(--color-muted)]"}`}>
                <button
                  type="button"
                  disabled={isPending || n.isRead}
                  onClick={() => startTransition(() => markNotificationReadAction(n.id))}
                  className="w-full cursor-pointer text-left disabled:cursor-default"
                >
                  <p className="text-sm font-semibold text-[var(--color-foreground)]">{n.title}</p>
                  <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">{n.body}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
