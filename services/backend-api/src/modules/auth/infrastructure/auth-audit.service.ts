import { Injectable, Logger } from '@nestjs/common';
import type { IAuditService, AuditRecordInput } from '@qnsc-vn/identity';
import { db } from '../../../db/client';
import { authAuditLog } from '../../../db/schema/auth-audit-log';

/**
 * Minimal, auth-events-only start on docs Section 11's "undo + audit log"
 * gap — NOT the general business audit log, which stays open. Per the
 * `IAuditService` contract, `record()` must never throw back to the caller —
 * a bad audit row can never break a real login/logout/reset.
 */
@Injectable()
export class AuthAuditService implements IAuditService {
  private readonly logger = new Logger(AuthAuditService.name);

  async record(input: AuditRecordInput): Promise<void> {
    try {
      await db.insert(authAuditLog).values({
        workspaceId: input.workspaceId || null,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        userId: input.actorId ?? null,
        actorEmail: input.actorEmail ?? null,
        action: input.action,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        metadata:
          input.metadata || input.changes
            ? { ...(input.metadata ?? {}), ...(input.changes ? { changes: input.changes } : {}) }
            : null,
      });
    } catch (err) {
      this.logger.error(`Failed to record auth audit event: ${input.action}`, err instanceof Error ? err.stack : String(err));
    }
  }
}
