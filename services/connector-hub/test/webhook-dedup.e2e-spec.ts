import { describe, it, expect } from 'vitest';
import { uuidv7 } from 'uuidv7';
import { runWithTenant } from '../src/platform/tenant-context';
import { WebhookEventDrizzleRepository } from '../src/modules/webhooks/infrastructure/persistence/webhook-event.drizzle-repository';
import { WebhookIntakeService } from '../src/modules/webhooks/application/webhook-intake.service';

/**
 * Real Postgres, no mocks — docs Section 7's "deduplicate via a unique
 * index on provider_event_id," made concrete and provider-agnostic.
 */

const webhookEventRepo = new WebhookEventDrizzleRepository();
const webhookIntakeService = new WebhookIntakeService(webhookEventRepo);

describe('Webhook intake dedup (docs Section 7) — real Postgres, no mocks', () => {
  it('a retried delivery of the SAME provider_event_id is recognized, not double-recorded', async () => {
    const tenantId = uuidv7();
    const event = {
      tenantId,
      provider: 'sepay',
      providerEventId: `sepay-evt-${Date.now()}`,
      eventType: 'payment.received',
      occurredAt: new Date(),
      payload: { transferAmount: 100000 },
    };

    const first = await runWithTenant(tenantId, () => webhookIntakeService.recordEvent(event));
    expect(first.isNew).toBe(true);

    const second = await runWithTenant(tenantId, () => webhookIntakeService.recordEvent(event));
    expect(second.isNew).toBe(false);
    expect(second.event.id).toBe(first.event.id);
  });

  it('3 truly concurrent deliveries of the same event: exactly one insert happens, the other two see it as already-recorded', async () => {
    const tenantId = uuidv7();
    const event = {
      tenantId,
      provider: 'sepay',
      providerEventId: `sepay-evt-concurrent-${Date.now()}`,
      eventType: 'payment.received',
      occurredAt: new Date(),
      payload: { transferAmount: 50000 },
    };

    const results = await Promise.all([
      runWithTenant(tenantId, () => webhookIntakeService.recordEvent(event)),
      runWithTenant(tenantId, () => webhookIntakeService.recordEvent(event)),
      runWithTenant(tenantId, () => webhookIntakeService.recordEvent(event)),
    ]);

    const newCount = results.filter((r) => r.isNew).length;
    expect(newCount).toBe(1);
    // All 3 resolve to the SAME stored row id.
    const ids = new Set(results.map((r) => r.event.id));
    expect(ids.size).toBe(1);
  });

  it('the same provider_event_id from a DIFFERENT provider is a distinct event, not deduped against it', async () => {
    const tenantId = uuidv7();
    const sharedId = `evt-${Date.now()}`;

    const sepayEvent = await runWithTenant(tenantId, () =>
      webhookIntakeService.recordEvent({ tenantId, provider: 'sepay', providerEventId: sharedId, eventType: 'payment.received', occurredAt: new Date(), payload: {} }),
    );
    const ghnEvent = await runWithTenant(tenantId, () =>
      webhookIntakeService.recordEvent({ tenantId, provider: 'ghn', providerEventId: sharedId, eventType: 'shipment.updated', occurredAt: new Date(), payload: {} }),
    );

    expect(sepayEvent.isNew).toBe(true);
    expect(ghnEvent.isNew).toBe(true);
    expect(sepayEvent.event.id).not.toBe(ghnEvent.event.id);
  });

  it('forwardedAt starts NULL and is set only after markForwarded is called — a redelivery before that still sees it unset', async () => {
    const tenantId = uuidv7();
    const event = {
      tenantId,
      provider: 'sepay',
      providerEventId: `sepay-evt-forward-${Date.now()}`,
      eventType: 'payment.received',
      occurredAt: new Date(),
      payload: { transferAmount: 100000 },
    };

    const first = await runWithTenant(tenantId, () => webhookIntakeService.recordEvent(event));
    expect(first.event.forwardedAt).toBeNull();

    // Simulates a redelivery before forwarding ever succeeded — still unset.
    const redelivered = await runWithTenant(tenantId, () => webhookIntakeService.recordEvent(event));
    expect(redelivered.event.forwardedAt).toBeNull();

    await runWithTenant(tenantId, () => webhookIntakeService.markForwarded(first.event.id, tenantId));

    const afterForward = await runWithTenant(tenantId, () => webhookIntakeService.recordEvent(event));
    expect(afterForward.event.forwardedAt).not.toBeNull();
  });
});
