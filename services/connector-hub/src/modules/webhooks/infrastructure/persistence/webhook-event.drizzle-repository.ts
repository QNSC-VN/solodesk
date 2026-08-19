import { Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { db } from '../../../../db/client';
import { webhookEvents } from '../../../../db/schema/webhook-events';
import { withTenantTransaction } from '../../../../platform/tenant-context';
import type { IWebhookEventRepository } from '../../domain/ports/webhook-event.repository';
import type { NormalizedWebhookEvent, StoredWebhookEvent } from '../../domain/webhook.types';

function toDomain(row: typeof webhookEvents.$inferSelect): StoredWebhookEvent {
  return {
    id: row.id,
    tenantId: row.tenantId,
    provider: row.provider,
    providerEventId: row.providerEventId,
    eventType: row.eventType,
    occurredAt: row.occurredAt,
    receivedAt: row.receivedAt,
    payload: row.payload as Record<string, unknown>,
  };
}

@Injectable()
export class WebhookEventDrizzleRepository implements IWebhookEventRepository {
  async recordIfNew(event: NormalizedWebhookEvent): Promise<StoredWebhookEvent | null> {
    return withTenantTransaction(db, event.tenantId, async (tx) => {
      const rows = await tx
        .insert(webhookEvents)
        .values({
          tenantId: event.tenantId,
          provider: event.provider,
          providerEventId: event.providerEventId,
          eventType: event.eventType,
          occurredAt: event.occurredAt,
          payload: event.payload,
        })
        .onConflictDoNothing({ target: [webhookEvents.provider, webhookEvents.providerEventId] })
        .returning();
      return rows[0] ? toDomain(rows[0]) : null;
    });
  }

  async findByProviderEventId(provider: string, providerEventId: string, tenantId: string): Promise<StoredWebhookEvent | null> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(webhookEvents)
        .where(and(eq(webhookEvents.provider, provider), eq(webhookEvents.providerEventId, providerEventId)))
        .limit(1);
      return rows[0] ? toDomain(rows[0]) : null;
    });
  }
}
