import { Injectable, NestInterceptor, ExecutionContext, CallHandler, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { runWithTenant } from './tenant-context';
import { SKIP_TENANT_CONTEXT_KEY } from './skip-tenant-context.decorator';

/**
 * Same shape as backend-api's interceptor of the same name. `@SkipTenantContext()`
 * here gates webhook-receiver routes (`src/modules/webhooks/api/*.controller.ts`),
 * never anything touching the vault or a resolved tenant's data.
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
