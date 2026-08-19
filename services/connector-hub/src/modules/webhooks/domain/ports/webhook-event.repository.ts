import type { NormalizedWebhookEvent, StoredWebhookEvent } from '../webhook.types';

export const WEBHOOK_EVENT_REPOSITORY = Symbol('WEBHOOK_EVENT_REPOSITORY');

export interface IWebhookEventRepository {
  /** `INSERT ... ON CONFLICT (provider, provider_event_id) DO NOTHING` — returns `null` if this exact event was already recorded (a retried delivery), never throws on a duplicate. */
  recordIfNew(event: NormalizedWebhookEvent): Promise<StoredWebhookEvent | null>;
  findByProviderEventId(provider: string, providerEventId: string, tenantId: string): Promise<StoredWebhookEvent | null>;
}
