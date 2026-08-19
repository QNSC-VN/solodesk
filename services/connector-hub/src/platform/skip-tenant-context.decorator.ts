import { SetMetadata } from '@nestjs/common';

export const SKIP_TENANT_CONTEXT_KEY = 'skipTenantContext';

/**
 * The ONLY sanctioned way to bypass `TenantContextInterceptor` — used here
 * for inbound third-party webhooks, which arrive with no tenant JWT at all
 * and must resolve `tenantId` themselves (e.g. by matching a bank account
 * number against the vault) before doing anything tenant-scoped.
 */
export const SkipTenantContext = () => SetMetadata(SKIP_TENANT_CONTEXT_KEY, true);
