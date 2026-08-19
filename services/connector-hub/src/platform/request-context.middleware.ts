import { Injectable, NestMiddleware } from '@nestjs/common';
import { RequestContextService } from '@qnsc-vn/platform-http';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';

/** Same shape as backend-api's middleware of the same name — see its header comment. */
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
