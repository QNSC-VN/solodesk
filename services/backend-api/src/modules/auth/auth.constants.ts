/**
 * Shared between the AUTH_SERVICE_OPTIONS provider (feeds @qnsc-vn/identity's
 * real AuthService.refresh/switchWorkspace) and SessionMinter (our own
 * initial-login session mint) — one place, so the two can never drift apart.
 */
export const ACCESS_TOKEN_TTL = '15m';
export const REFRESH_TOKEN_TTL = '30d';
