import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { PermissionDeniedException } from '@qnsc-vn/platform-http';
import type { Env } from '../config/env.schema';

/**
 * Same shape as backend-api's `InternalServiceGuard` (copied, not shared —
 * same YAGNI convention as this service's `tenant-context.ts`). connector-hub
 * has always been a CALLER of this mechanism (it sends
 * `X-Internal-Service-Token` when forwarding SePay payments to backend-api);
 * this is its first time being on the RECEIVING end — gating
 * `internal/onboarding/*`, called by agent-orchestrator's onboarding tools
 * (`connect_sepay`, docs Section 5.4's onboarding copilot flow).
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
    if (providedBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(providedBuf, expectedBuf);
  }
}
