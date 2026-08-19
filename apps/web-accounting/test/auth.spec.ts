import { describe, it, expect, afterAll } from "vitest";
import postgres from "postgres";
import { loginWithPassword, AuthError } from "../lib/auth";

/**
 * Real backend-api, real Postgres, no mocks — same discipline as
 * web-buyer-portal/test/trace.spec.ts. This app has no DB role of its own
 * (a pure HTTP client of backend-api's real endpoints), so
 * DATABASE_ADMIN_URL here is used ONLY to read the real verification token
 * out of `notifications.email_outbox` (no real email inbox exists in this
 * dev environment — same "read the token from the DB/log directly"
 * convention backend-api's own e2e tests + manual smoke tests use).
 */

const baseUrl = process.env.BACKEND_API_BASE_URL ?? "http://localhost:3000/v1";
const adminSql = postgres(process.env.DATABASE_ADMIN_URL ?? "postgres://solodesk_superuser:dev_only_password@localhost:5432/solodesk", { max: 1 });

afterAll(async () => {
  await adminSql.end();
});

function uniqueEmail(label: string): string {
  return `web-accounting-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

async function signupAndVerify(email: string, password: string): Promise<void> {
  const signupRes = await fetch(`${baseUrl}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, legalName: "Web Accounting Test Tenant", industry: "food_beverage" }),
  });
  if (!signupRes.ok) throw new Error(`signup failed: ${signupRes.status} ${await signupRes.text()}`);

  const [userRow] = await adminSql`SELECT id FROM identity.users WHERE email = ${email}`;
  const [outboxRow] = await adminSql`
    SELECT template_vars FROM notifications.email_outbox
    WHERE user_id = ${userRow.id} AND template_name = 'EMAIL_VERIFY'
    ORDER BY created_at DESC LIMIT 1
  `;
  const verifyUrl = (outboxRow.template_vars as { verifyUrl: string }).verifyUrl;
  const token = /token=([A-Za-z0-9_-]+)/.exec(verifyUrl)?.[1];
  if (!token) throw new Error(`No token found in email_outbox row: ${JSON.stringify(outboxRow.template_vars)}`);

  const verifyRes = await fetch(`${baseUrl}/auth/verify-email?token=${token}`);
  if (!verifyRes.ok) throw new Error(`verify-email failed: ${verifyRes.status} ${await verifyRes.text()}`);
}

describe("loginWithPassword — real backend-api, real Postgres", () => {
  it("returns a real session for a verified account", async () => {
    const email = uniqueEmail("login-ok");
    const password = "correct horse battery";
    await signupAndVerify(email, password);

    const session = await loginWithPassword(email, password);

    expect(session.accessToken).toBeTruthy();
    expect(session.refreshToken).toBeTruthy();
    expect(session.user.email).toBe(email);
  });

  it("rejects a wrong password", async () => {
    const email = uniqueEmail("login-wrongpw");
    await signupAndVerify(email, "the real password");

    await expect(loginWithPassword(email, "totally wrong")).rejects.toThrow(AuthError);
  });

  it("rejects a nonexistent email", async () => {
    await expect(loginWithPassword(uniqueEmail("never-signed-up"), "anything")).rejects.toThrow(AuthError);
  });
});
