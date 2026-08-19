import { Injectable, NestInterceptor, ExecutionContext, CallHandler, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { runWithTenant } from './tenant-context';
import { SKIP_TENANT_CONTEXT_KEY } from './skip-tenant-context.decorator';

/**
 * Wires every HTTP request into the tenant-context ALS store (Section 4.1).
 * Registered globally in app.module.ts — no controller/handler opts in or
 * out of this by default, unlike the auth `@RequirePermission` decorator
 * pattern rally uses. Tenant scoping is not a per-route decision — the ONLY
 * exception is `@SkipTenantContext()` for routes that legitimately run before
 * any tenant exists (onboarding), never for anything touching tenant data.
 *
/**
 * Expects `request.user.contextId` — `@qnsc-vn/identity`'s `JwtAuthGuard`
 * (wired in `src/platform/auth/auth.module.ts`, runs before this interceptor
 * since Nest executes Guards before Interceptors) populates `request.user`
 * with the verified `JwtPayload` on every non-`@Public()` route. `contextId`
 * is the package's deliberately generic name for "authorization scope" —
 * its own doc comment says outright: "For a multi-tenant product (rally)
 * this is the active workspace id". SoloDesk's equivalent is `tenantId`; this
 * interceptor is where that vocabulary bridge happens, once, in one place.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_TENANT_CONTEXT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const tenantId: string | null | undefined = request.user?.contextId;

    if (!tenantId) {
      throw new UnauthorizedException('No contextId (tenantId) on authenticated principal — cannot establish tenant context.');
    }

    return new Observable((subscriber) => {
      runWithTenant(tenantId, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}
