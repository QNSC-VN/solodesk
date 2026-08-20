import { NextResponse, type NextRequest } from "next/server";
import { refreshSession } from "./lib/auth";

/**
 * Next.js 16 renamed `middleware.js` to `proxy.js` (the old file convention
 * is deprecated — see `node_modules/next/dist/docs/.../proxy.md`, same
 * "read the bundled docs, don't trust training data" discipline
 * `web-buyer-portal`'s own `AGENTS.md` already flags for this Next version).
 *
 * Two jobs: (1) redirect to /login when there's no session at all, (2)
 * proactively refresh the access token when it's near expiry. Proactive
 * refresh lives here rather than in a Server Component's data-fetch helper
 * because only a Route Handler/Server Function/Proxy response can set
 * cookies — a Server Component render cannot (see `lib/session.ts`'s own
 * comment and `node_modules/next/dist/docs/.../cookies.md`'s "Setting
 * cookies is not supported during Server Component rendering").
 */

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
const REFRESH_TOKEN_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const REFRESH_BUFFER_MS = 60_000; // refresh proactively within 1min of expiry

function clearSessionCookies(response: NextResponse): void {
  for (const name of ["sd_at", "sd_rt", "sd_csrf", "sd_exp", "sd_user"]) {
    response.cookies.delete(name);
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/login") || pathname.startsWith("/forgot-password") || pathname.startsWith("/reset-password")) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get("sd_at")?.value;
  const refreshToken = request.cookies.get("sd_rt")?.value;
  const csrfToken = request.cookies.get("sd_csrf")?.value;
  const expiresAt = Number(request.cookies.get("sd_exp")?.value ?? 0);

  if (!accessToken || !refreshToken) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const needsRefresh = !expiresAt || Date.now() >= expiresAt - REFRESH_BUFFER_MS;
  if (!needsRefresh) {
    return NextResponse.next();
  }

  try {
    const refreshed = await refreshSession(refreshToken, csrfToken);
    const response = NextResponse.next();
    response.cookies.set("sd_at", refreshed.accessToken, { ...COOKIE_OPTS, maxAge: refreshed.expiresIn });
    response.cookies.set("sd_rt", refreshed.refreshToken, { ...COOKIE_OPTS, maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS });
    response.cookies.set("sd_csrf", refreshed.csrfToken, COOKIE_OPTS);
    response.cookies.set("sd_exp", String(Date.now() + refreshed.expiresIn * 1000), COOKIE_OPTS);
    return response;
  } catch {
    // Refresh token expired/revoked (e.g. logout-all elsewhere) — the only
    // real option is a fresh login.
    const response = NextResponse.redirect(new URL("/login", request.url));
    clearSessionCookies(response);
    return response;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
