import { Injectable, NestMiddleware } from '@nestjs/common';
import { RequestContextService } from '@qnsc-vn/platform-http';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';

/**
 * Enters the AsyncLocalStorage-backed `RequestContextService.run()` for
 * every request, BEFORE guards execute — middleware is the only Nest layer
 * that runs early enough for this to matter. `GlobalJwtAuthGuard` (via the
 * real `@qnsc-vn/identity` `JwtAuthGuard`) calls `setAuthContext(...)` after
 * verifying the token, which only has something to mutate into because this
 * middleware already entered the store.
 *
 * One `RequestContextService` instance backs BOTH `AUTH_CONTEXT` (identity)
 * and `REQUEST_CONTEXT` (platform-http's `GlobalExceptionFilter`) — see
 * `auth.module.ts`. That's the intended binding: the package's own doc
 * comment says it "structurally satisfies both."
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly requestContext: RequestContextService) {}

  use(req: FastifyRequest['raw'], _res: FastifyReply['raw'], next: () => void) {
    const correlationId = (req.headers['x-correlation-id'] as string | undefined) ?? randomUUID();
    this.requestContext.run(
      {
        workspaceId: undefined,
        userId: undefined,
        sessionId: undefined,
        correlationId,
        traceparent: req.headers['traceparent'] as string | undefined,
      },
      next,
    );
  }
}
