import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from '@qnsc-vn/identity';

/**
 * The full verified `JwtPayload` — `GlobalJwtAuthGuard`/`JwtStrategy` already
 * populate `request.user` with this on every non-`@Public()` route.
 * `@CurrentTenant()`-equivalent for auth endpoints (`logout`, `me`, ...) that
 * need more than just `contextId`.
 */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): JwtPayload => {
  const request = ctx.switchToHttp().getRequest();
  return request.user as JwtPayload;
});
