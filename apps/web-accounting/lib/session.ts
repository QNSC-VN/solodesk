import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Session } from "./auth";

/**
 * Cookie glue (`next/headers`) — NOT unit tested directly (framework glue,
 * same "thin wrapper, verify via manual smoke test" precedent as every
 * other route/glue layer in this repo). `lib/auth.ts`'s functions this
 * wraps ARE unit tested, against a real running backend-api.
 *
 * All cookies httpOnly — the browser never gets the access/refresh token,
 * even `sd_user` (display-only data) stays server-side; Server Components
 * read it here and pass it down to Client Components as props.
 */

const COOKIE_NAMES = ["sd_at", "sd_rt", "sd_csrf", "sd_exp", "sd_user"] as const;

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

const REFRESH_TOKEN_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // matches backend-api's REFRESH_TOKEN_TTL ('30d')

export interface CurrentSession {
  accessToken: string;
  user: Session["user"];
}

/** Sets all 5 session cookies from a real login/verify/google-login response — call only from a Server Action or Route Handler. */
export async function persistSession(session: Session): Promise<void> {
  const store = await cookies();
  store.set("sd_at", session.accessToken, { ...COOKIE_OPTS, maxAge: session.expiresIn });
  store.set("sd_rt", session.refreshToken, { ...COOKIE_OPTS, maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS });
  store.set("sd_csrf", session.csrfToken, COOKIE_OPTS);
  store.set("sd_exp", String(Date.now() + session.expiresIn * 1000), COOKIE_OPTS);
  store.set("sd_user", JSON.stringify(session.user), COOKIE_OPTS);
}

/** Clears all 5 session cookies — call only from a Server Action or Route Handler. */
export async function clearSession(): Promise<void> {
  const store = await cookies();
  for (const name of COOKIE_NAMES) store.delete(name);
}

/** Read-only — safe to call from a Server Component. */
export async function getSession(): Promise<CurrentSession | null> {
  const store = await cookies();
  const accessToken = store.get("sd_at")?.value;
  const userJson = store.get("sd_user")?.value;
  if (!accessToken || !userJson) return null;
  try {
    return { accessToken, user: JSON.parse(userJson) as Session["user"] };
  } catch {
    return null;
  }
}

/** Same as `getSession`, but redirects to /login instead of returning null — the common case for a protected page. */
export async function requireSession(): Promise<CurrentSession> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** Read-only access-token accessor for the Server Actions in app/actions.ts. */
export async function getAccessToken(): Promise<string | null> {
  const store = await cookies();
  return store.get("sd_at")?.value ?? null;
}
