import { describe, it, expect, afterAll } from "vitest";
import postgres from "postgres";
import { forgotPassword, resetPassword, loginWithPassword, AuthError } from "../lib/auth";

/**
 * Real backend-api, real Postgres, no mocks. Reads the real reset token
 * out of `notifications.email_outbox`'s `PASSWORD_RESET` row — same "no
 * real inbox in dev, read the token from the DB directly" convention
 * `auth.spec.ts`'s `signupAndVerify` already uses for the verify-email
 * token. Each `it()` here signs up its own fresh account rather than
 * sharing one via `beforeAll` — `POST /v1/auth/forgot-password` has its
 * own separate rate limit (3/hour PER EMAIL, not per IP), so reusing one
 * email across multiple forgot-password calls in this file would trip it;
 * one email per test avoids that without weakening the limiter.
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
    body: JSON.stringify({ email, password, legalName: "Web Accounting Reset Test Tenant", industry: "food_beverage" }),
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

async function readResetToken(email: string): Promise<string> {
  const [userRow] = await adminSql`SELECT id FROM identity.users WHERE email = ${email}`;
  const [outboxRow] = await adminSql`
    SELECT template_vars FROM notifications.email_outbox
    WHERE user_id = ${userRow.id} AND template_name = 'PASSWORD_RESET'
    ORDER BY created_at DESC LIMIT 1
  `;
  const resetUrl = (outboxRow.template_vars as { resetUrl: string }).resetUrl;
  // Confirms the real fix this feature made: the link points at
  // web-accounting's own /reset-password page, not backend-api's port —
  // see CLAUDE.md's env.schema.ts comment on APP_PUBLIC_URL vs
  // WEB_ACCOUNTING_PUBLIC_URL.
  expect(resetUrl).toContain("/reset-password?token=");
  const token = /token=([A-Za-z0-9_-]+)/.exec(resetUrl)?.[1];
  if (!token) throw new Error(`No token found in email_outbox row: ${resetUrl}`);
  return token;
}

describe("forgotPassword / resetPassword — real backend-api, real Postgres", () => {
  it("a real reset token from a real forgot-password request successfully resets the password", async () => {
    const email = uniqueEmail("reset-happy");
    const oldPassword = "correct horse battery";
    const newPassword = "new correct horse battery";
    await signupAndVerify(email, oldPassword);

    const { rateLimited } = await forgotPassword(email);
    expect(rateLimited).toBe(false);

    const token = await readResetToken(email);
    await resetPassword(token, newPassword);

    await expect(loginWithPassword(email, oldPassword)).rejects.toThrow(AuthError);
    const session = await loginWithPassword(email, newPassword);
    expect(session.user.email).toBe(email);
  });

  it("resolves the same way for an email with no account — no enumeration leak", async () => {
    const { rateLimited } = await forgotPassword(uniqueEmail("never-signed-up"));
    expect(rateLimited).toBe(false);
  });

  it("rejects reusing an already-used reset token", async () => {
    const email = uniqueEmail("reset-reuse");
    const password = "correct horse battery";
    await signupAndVerify(email, password);
    await forgotPassword(email);
    const token = await readResetToken(email);

    await resetPassword(token, "first new password");
    await expect(resetPassword(token, "second new password")).rejects.toThrow(AuthError);
  });

  it("rejects a garbage token", async () => {
    await expect(resetPassword("not-a-real-token", "whatever password")).rejects.toThrow(AuthError);
  });
});
