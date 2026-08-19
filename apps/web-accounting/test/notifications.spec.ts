import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";
import { getNotifications, getUnreadCount, markRead, markAllRead } from "../lib/notifications";
import { createVerifiedSession } from "./helpers";

/**
 * Real backend-api, real Postgres, no mocks. ONE real signup for this
 * whole file (`beforeAll`) — see auth.spec.ts's own comment on why.
 */

const baseUrl = process.env.BACKEND_API_BASE_URL ?? "http://localhost:3000/v1";
const adminSql = postgres(process.env.DATABASE_ADMIN_URL ?? "postgres://solodesk_superuser:dev_only_password@localhost:5432/solodesk", { max: 1 });

afterAll(async () => {
  await adminSql.end();
});

let accessToken: string;
let tenantId: string;
let userId: string;

beforeAll(async () => {
  ({ accessToken, tenantId, userId } = await createVerifiedSession(adminSql, baseUrl, "notif"));
});

async function seedNotification(title: string): Promise<void> {
  await adminSql`
    INSERT INTO notifications.notifications (tenant_id, user_id, type, title, body)
    VALUES (${tenantId}, ${userId}, 'EINVOICE_THRESHOLD_CROSSED', ${title}, 'test body')
  `;
}

describe("notifications lib — real backend-api, real Postgres", () => {
  it("a freshly verified account already has the real EMAIL_VERIFY notification from signup itself, then reflects seeded rows and mark-read/mark-all-read", async () => {
    // Not a fresh-account-has-zero-notifications case — signupWithPassword
    // (backend-api) always files a real EMAIL_VERIFY notification, verified
    // here rather than assumed. Confirmed by writing this test, not by
    // reading the code.
    expect(await getUnreadCount(accessToken)).toBe(1);
    const initial = await getNotifications(accessToken);
    expect(initial).toHaveLength(1);
    expect(initial[0]!.type).toBe("EMAIL_VERIFY");

    await seedNotification("First notification");
    await seedNotification("Second notification");

    const notifications = await getNotifications(accessToken);
    expect(notifications).toHaveLength(3);
    expect(await getUnreadCount(accessToken)).toBe(3);

    await markRead(accessToken, notifications[0]!.id);
    expect(await getUnreadCount(accessToken)).toBe(2);

    await markAllRead(accessToken);
    expect(await getUnreadCount(accessToken)).toBe(0);
  });
});
