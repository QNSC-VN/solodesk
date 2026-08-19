import { authenticatedFetch, authenticatedJson } from "./backend-api-client";

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

/** Calls backend-api's real `/v1/notifications*` endpoints (see CLAUDE.md's "Notifications" section) — pure, testable against a real running backend-api. */
export async function getNotifications(accessToken: string): Promise<Notification[]> {
  return authenticatedJson<Notification[]>(accessToken, "/notifications");
}

export async function getUnreadCount(accessToken: string): Promise<number> {
  const { count } = await authenticatedJson<{ count: number }>(accessToken, "/notifications/unread-count");
  return count;
}

export async function markRead(accessToken: string, notificationId: string): Promise<void> {
  await authenticatedFetch(accessToken, `/notifications/${notificationId}/read`, { method: "POST" });
}

export async function markAllRead(accessToken: string): Promise<void> {
  await authenticatedFetch(accessToken, "/notifications/read-all", { method: "POST" });
}
