import { describe, it, expect, afterAll } from "vitest";
import postgres from "postgres";
import { getNotifications, getUnreadCount, markRead, markAllRead } from "../lib/notifications";
import { createVerifiedSession } from "./helpers";

/** Real backend-api, real Postgres, no mocks — same discipline as web-buyer-portal/test/trace.spec.ts. */

const baseUrl = process.env.BACKEND_API_BASE_URL ?? "http://localhost:3000/v1";
const adminSql = postgres(process.env.DATABASE_ADMIN_URL ?? "postgres://solodesk_superuser:dev_only_password@localhost:5432/solodesk", { max: 1 });

afterAll(async () => {
  await adminSql.end();
});

async function seedNotification(tenantId: string, userId: string, title: string): Promise<void> {
  await adminSql`
    INSERT INTO notifications.notifications (tenant_id, user_id, type, title, body)
    VALUES (${tenantId}, ${userId}, 'EINVOICE_THRESHOLD_CROSSED', ${title}, 'test body')
  `;
}

describe("notifications lib — real backend-api, real Postgres", () => {
  it("getNotifications/getUnreadCount reflect real seeded rows, and mark-read/mark-all-read work", async () => {
    // signupWithPassword itself already files a real EMAIL_VERIFY
    // notification (found while writing the "no notifications" case below)
    // — the baseline here is 1, not 0, before seeding anything else.
    const { accessToken, tenantId, userId } = await createVerifiedSession(adminSql, baseUrl, "notif");
    await seedNotification(tenantId, userId, "First notification");
    await seedNotification(tenantId, userId, "Second notification");

    const notifications = await getNotifications(accessToken);
    expect(notifications).toHaveLength(3);
    expect(await getUnreadCount(accessToken)).toBe(3);

    await markRead(accessToken, notifications[0]!.id);
    expect(await getUnreadCount(accessToken)).toBe(2);

    await markAllRead(accessToken);
    expect(await getUnreadCount(accessToken)).toBe(0);
  });

  it("a freshly verified account already has the real EMAIL_VERIFY notification from signup itself", async () => {
    // Not a fresh-account-has-zero-notifications case — signupWithPassword
    // (backend-api) always files a real EMAIL_VERIFY notification, verified
    // here rather than assumed. Confirmed by writing this test, not by
    // reading the code.
    const { accessToken } = await createVerifiedSession(adminSql, baseUrl, "notif-signup-only");

    expect(await getUnreadCount(accessToken)).toBe(1);
    const notifications = await getNotifications(accessToken);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.type).toBe("EMAIL_VERIFY");
  });
});
