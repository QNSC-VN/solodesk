import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Opts a route out of authentication entirely — not used by any route in this service yet (every conversation route requires a real tenant session). Kept for parity with backend-api/connector-hub's auth wiring. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
