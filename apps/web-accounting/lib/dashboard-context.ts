import { requireSession, type CurrentSession } from "./session";
import { getNotifications, getUnreadCount, type Notification } from "./notifications";

export interface DashboardContext {
  session: CurrentSession;
  notifications: Notification[];
  unreadCount: number;
}

/**
 * Every authenticated page needs the same three things to render
 * `DashboardShell` (session, notification list, unread count) — shared here
 * instead of duplicated across `app/page.tsx`/`app/invoices/page.tsx`/
 * `app/stock/page.tsx`.
 */
export async function getDashboardContext(): Promise<DashboardContext> {
  const session = await requireSession();
  const [notifications, unreadCount] = await Promise.all([getNotifications(session.accessToken), getUnreadCount(session.accessToken)]);
  return { session, notifications, unreadCount };
}
