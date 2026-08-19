import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Opts a route out of authentication entirely — inbound third-party webhooks only (they carry their OWN provider-specific signature, not a SoloDesk JWT). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
