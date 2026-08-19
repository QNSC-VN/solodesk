import { SetMetadata } from '@nestjs/common';

export const SKIP_TENANT_CONTEXT_KEY = 'skipTenantContext';

/**
 * Marks a route as legitimately running BEFORE any tenant context exists —
 * e.g. tenant onboarding (`POST /v1/tenants`) or a health check. This is the
 * ONLY sanctioned way to bypass `TenantContextInterceptor` (Section 4.1); it
 * must never be used on a route that touches tenant-scoped data.
 */
export const SkipTenantContext = () => SetMetadata(SKIP_TENANT_CONTEXT_KEY, true);
