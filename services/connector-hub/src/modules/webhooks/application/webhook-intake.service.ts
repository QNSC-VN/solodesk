import { Inject, Injectable } from '@nestjs/common';
import { WEBHOOK_EVENT_REPOSITORY, type IWebhookEventRepository } from '../domain/ports/webhook-event.repository';
import type { NormalizedWebhookEvent, StoredWebhookEvent } from '../domain/webhook.types';

/**
 * Generic across every provider — a connector's webhook controller resolves
 * `tenantId` (via `VaultService.resolveWebhookToken`) and verifies the
 * provider-specific signature FIRST, then normalizes the payload into a
 * `NormalizedWebhookEvent` and calls this. Dedup (docs Section 7) happens
 * here once, not re-implemented per provider.
 */
@Injectable()
export class WebhookIntakeService {
  constructor(@Inject(WEBHOOK_EVENT_REPOSITORY) private readonly webhookEventRepository: IWebhookEventRepository) {}

  async recordEvent(event: NormalizedWebhookEvent): Promise<{ event: StoredWebhookEvent; isNew: boolean }> {
    const inserted = await this.webhookEventRepository.recordIfNew(event);
    if (inserted) {
      return { event: inserted, isNew: true };
    }

    const existing = await this.webhookEventRepository.findByProviderEventId(event.provider, event.providerEventId, event.tenantId);
    if (!existing) {
      throw new Error(`Webhook event ${event.provider}/${event.providerEventId} conflicted on insert but cannot be found — invariant violation, investigate.`);
    }
    return { event: existing, isNew: false };
  }
}
