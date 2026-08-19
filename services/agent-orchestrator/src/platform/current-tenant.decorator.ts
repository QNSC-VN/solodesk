import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';

/**
 * Reads `request.user.contextId` directly — set by `@qnsc-vn/identity`'s
 * `JwtAuthGuard` after verifying the Bearer token, same field backend-api's
 * `TenantContextInterceptor` bridges into its ALS store. This service skips
 * that ALS layer entirely (see `platform/tenant-db.ts`'s header comment):
 * there's no repository layer here reading an ambient tenant context, so a
 * direct param decorator is the whole mechanism, not a missing piece.
 */
export const CurrentTenant = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest();
  const tenantId: string | undefined = request.user?.contextId;
  if (!tenantId) {
    throw new UnauthorizedException('No contextId (tenantId) on authenticated principal.');
  }
  return tenantId;
});
