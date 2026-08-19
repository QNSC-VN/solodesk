"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { logout as backendLogout } from "@/lib/auth";
import { markRead as backendMarkRead, markAllRead as backendMarkAllRead } from "@/lib/notifications";
import { getAccessToken, clearSession } from "@/lib/session";

export async function logoutAction(): Promise<void> {
  const accessToken = await getAccessToken();
  if (accessToken) {
    await backendLogout(accessToken);
  }
  await clearSession();
  redirect("/login");
}

export async function markNotificationReadAction(notificationId: string): Promise<void> {
  const accessToken = await getAccessToken();
  if (!accessToken) return;
  await backendMarkRead(accessToken, notificationId);
  revalidatePath("/", "layout");
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const accessToken = await getAccessToken();
  if (!accessToken) return;
  await backendMarkAllRead(accessToken);
  revalidatePath("/", "layout");
}
