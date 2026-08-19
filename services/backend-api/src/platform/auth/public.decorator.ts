import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Opts a route out of authentication entirely — tenant onboarding
 * (`POST /v1/tenants`) and health checks only. `@qnsc-vn/identity` v6 removed
 * its own `@Public()` decorator on purpose ("both products already have their
 * own" — see the package README's "Not in scope" table); this is SoloDesk's.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
