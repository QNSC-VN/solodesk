import type postgres from "postgres";
import { loginWithPassword } from "../lib/auth";

/**
 * Shared by orders.spec.ts/notifications.spec.ts — signup + verify (real
 * HTTP, real backend-api) + login, returning a real access token and the
 * new tenant's id (for seeding fixture rows directly via the admin
 * connection). Not a `*.spec.ts` file, so vitest never picks it up as its
 * own suite.
 */
export async function createVerifiedSession(
  adminSql: ReturnType<typeof postgres>,
  baseUrl: string,
  label: string,
): Promise<{ accessToken: string; userId: string; tenantId: string }> {
  const email = `web-accounting-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const password = "correct horse battery";

  const signupRes = await fetch(`${baseUrl}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, legalName: `Web Accounting Test ${label}`, industry: "food_beverage" }),
  });
  if (!signupRes.ok) throw new Error(`signup failed: ${signupRes.status} ${await signupRes.text()}`);

  const [userRow] = await adminSql`SELECT id FROM identity.users WHERE email = ${email}`;
  const [membershipRow] = await adminSql`SELECT tenant_id FROM identity.user_tenant_memberships WHERE user_id = ${userRow.id}`;
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

  const session = await loginWithPassword(email, password);
  return { accessToken: session.accessToken, userId: userRow.id as string, tenantId: membershipRow.tenant_id as string };
}
