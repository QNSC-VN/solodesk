import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { PermissionDeniedException } from '@qnsc-vn/platform-http';
import type { Env } from '../config/env.schema';

/**
 * Gates ONLY the `internal/payments/*` route family (connector-hub
 * forwarding a verified SePay payment event) — a pre-shared secret checked
 * via `X-Internal-Service-Token`, constant-time compared to avoid a timing
 * side-channel. This is a deliberately narrow, honest MVP mechanism, not a
 * general service-mesh/mTLS scheme — every route it protects must also be
 * `@Public()` (skips the per-user JWT guard entirely) and
 * `@SkipTenantContext()` (there's no `request.user.contextId`, the caller
 * supplies `tenantId` explicitly in the body instead). See CLAUDE.md's
 * connector-hub -> payment-reconcile section for the full rationale.
 */
@Injectable()
export class InternalServiceGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Env>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const provided = request.headers['x-internal-service-token'] as string | undefined;
    const expected: string = this.config.get('INTERNAL_SERVICE_TOKEN', { infer: true })!;

    if (!provided || !this.matches(provided, expected)) {
      throw new PermissionDeniedException('INTERNAL_SERVICE_AUTH_FAILED', 'Missing or incorrect X-Internal-Service-Token header.');
    }
    return true;
  }

  private matches(provided: string, expected: string): boolean {
    const providedBuf = Buffer.from(provided);
    const expectedBuf = Buffer.from(expected);
    // timingSafeEqual throws on length mismatch rather than returning false —
    // compare lengths first (this leaks length, not content, an accepted
    // trade-off for a random 32+ byte secret).
    if (providedBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(providedBuf, expectedBuf);
  }
}
