/**
 * Pure functions — no cookie/`next/headers` access here, so these are
 * directly unit-testable exactly like `web-buyer-portal`'s `getLotTrace`.
 * `session.ts` is the thin cookie-reading/writing glue that wraps these
 * for real use inside Server Actions/Components.
 *
 * Calls backend-api's real `/v1/auth/*` endpoints (see CLAUDE.md's "Real
 * login" section) — this app is its own thin BFF: backend-api has no CORS
 * configured, so these calls only ever happen server-side, never from the
 * browser (see CLAUDE.md's "web-accounting" section).
 */

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  locale: string;
  timezone: string;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  expiresIn: number;
  user: SessionUser;
}

export class AuthError extends Error {}

function baseUrl(): string {
  return process.env.BACKEND_API_BASE_URL ?? "http://localhost:3000/v1";
}

async function parseSessionResponse(res: Response, failureMessage: string): Promise<Session> {
  if (!res.ok) {
    const body = await res.text();
    throw new AuthError(`${failureMessage}: ${res.status} ${body}`);
  }
  return (await res.json()) as Session;
}

export async function loginWithPassword(email: string, password: string): Promise<Session> {
  const res = await fetch(`${baseUrl()}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return parseSessionResponse(res, "Login failed");
}

export async function loginWithGoogle(idToken: string): Promise<Session> {
  const res = await fetch(`${baseUrl()}/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  return parseSessionResponse(res, "Google login failed");
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  expiresIn: number;
}

export async function refreshSession(refreshToken: string, csrfToken?: string): Promise<RefreshResult> {
  const res = await fetch(`${baseUrl()}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken, ...(csrfToken ? { csrfToken } : {}) }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new AuthError(`Refresh failed: ${res.status} ${body}`);
  }
  return (await res.json()) as RefreshResult;
}

export async function logout(accessToken: string): Promise<void> {
  await fetch(`${baseUrl()}/auth/logout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

/**
 * Always returns the same generic outcome regardless of whether the email
 * exists (backend-api's own no-email-enumeration design — see
 * auth.controller.ts) — the only thing worth distinguishing on the caller's
 * side is a real 429 (rate limited), which doesn't leak anything about the
 * email itself.
 */
export async function forgotPassword(email: string): Promise<{ rateLimited: boolean }> {
  const res = await fetch(`${baseUrl()}/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  return { rateLimited: res.status === 429 };
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const res = await fetch(`${baseUrl()}/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, newPassword }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new AuthError(`Reset password failed: ${res.status} ${body}`);
  }
}
