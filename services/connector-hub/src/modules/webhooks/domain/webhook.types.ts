/** CloudEvents-style envelope (docs Section 7) — id/source/type/time, normalized before business logic ever sees a provider's raw payload shape. */
export interface NormalizedWebhookEvent {
  tenantId: string;
  provider: string;
  providerEventId: string;
  eventType: string;
  occurredAt: Date;
  payload: Record<string, unknown>;
}

export interface StoredWebhookEvent extends NormalizedWebhookEvent {
  id: string;
  receivedAt: Date;
}
