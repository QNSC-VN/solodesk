import { pgSchema, uuid, text, timestamp, jsonb, unique } from 'drizzle-orm/pg-core';

export const syncSchema = pgSchema('sync');

export const webhookEvents = syncSchema.table(
  'webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    provider: text('provider').notNull(),
    providerEventId: text('provider_event_id').notNull(),
    eventType: text('event_type').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    payload: jsonb('payload').notNull(),
  },
  (t) => ({
    providerEventUnique: unique().on(t.provider, t.providerEventId),
  }),
);
