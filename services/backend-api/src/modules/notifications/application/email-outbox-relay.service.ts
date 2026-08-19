import { Injectable, Logger } from '@nestjs/common';
import { eq, and, lte } from 'drizzle-orm';
import { db, type Db } from '../../../db/client';
import { withTenantTransaction } from '../../../platform/tenant-context';
import { tenants } from '../../../db/schema/tenants';
import { users } from '../../../db/schema/users';
import { emailOutbox } from '../../../db/schema/email-outbox';
import { EmailDispatcher } from './email-dispatcher.service';

const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 30_000; // 30s, doubling per attempt
const MAX_BACKOFF_MS = 30 * 60_000; // capped at 30min
const BATCH_SIZE_PER_TENANT = 5;

function backoffMs(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** attempts, MAX_BACKOFF_MS);
}

/**
 * The sweep half of the transactional outbox (CLAUDE.md's "Notifications"
 * section) — same tuned backoff numbers as rally's own production-proven
 * `AbstractOutboxRelay` (30s→30min, cap 5 attempts).
 *
 * `email_outbox` is correctly RLS-scoped per tenant (it's real business
 * data, not global identity data like the real-login tables) — which means
 * a single global "SELECT ... FOR UPDATE SKIP LOCKED" across all tenants is
 * impossible without ambient tenant context. `identity.tenants` itself is
 * NOT RLS-scoped (it IS the tenant list), so this sweep iterates every
 * tenant and opens its own small `withTenantTransaction`-scoped batch per
 * tenant — found while wiring this, not assumed; a real, deliberate
 * trade-off for a pilot-scale program, not a hack.
 */
@Injectable()
export class EmailOutboxRelayService {
  private readonly logger = new Logger(EmailOutboxRelayService.name);

  constructor(private readonly dispatcher: EmailDispatcher) {}

  async processBatch(): Promise<{ processed: number }> {
    const allTenants = await db.select({ id: tenants.id }).from(tenants);
    let processed = 0;
    for (const tenant of allTenants) {
      processed += await this.processTenantBatch(tenant.id);
    }
    return { processed };
  }

  private async processTenantBatch(tenantId: string): Promise<number> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const dueRows = await tx
        .select()
        .from(emailOutbox)
        .where(and(eq(emailOutbox.tenantId, tenantId), eq(emailOutbox.status, 'pending'), lte(emailOutbox.nextAttemptAt, new Date())))
        .limit(BATCH_SIZE_PER_TENANT)
        .for('update', { skipLocked: true });

      for (const row of dueRows) {
        await this.processOne(tx, row);
      }
      return dueRows.length;
    });
  }

  private async processOne(tx: Db, row: typeof emailOutbox.$inferSelect): Promise<void> {
    try {
      const [recipient] = await tx.select({ email: users.email }).from(users).where(eq(users.id, row.userId)).limit(1);
      if (!recipient) {
        throw new Error(`User ${row.userId} no longer exists.`);
      }

      await this.dispatcher.dispatch(recipient.email, row.templateName, row.templateVars as never);

      await tx.update(emailOutbox).set({ status: 'sent', sentAt: new Date() }).where(eq(emailOutbox.id, row.id));
    } catch (err) {
      const attempts = row.attempts + 1;
      const message = err instanceof Error ? err.message : String(err);
      if (attempts >= MAX_ATTEMPTS) {
        this.logger.error(`email_outbox row ${row.id} reached ${MAX_ATTEMPTS} attempts, marking dead_letter: ${message}`);
        await tx.update(emailOutbox).set({ status: 'dead_letter', attempts, lastError: message }).where(eq(emailOutbox.id, row.id));
      } else {
        await tx
          .update(emailOutbox)
          .set({ attempts, lastError: message, nextAttemptAt: new Date(Date.now() + backoffMs(attempts)) })
          .where(eq(emailOutbox.id, row.id));
      }
    }
  }
}
