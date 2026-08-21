import { pgSchema, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

export const messagingSchema = pgSchema('messaging');

/** Only Zalo carries inbound customer chat in this product's world so far — marketplace connectors deliver orders, never chat. */
export type MessageChannel = 'zalo';

export type MessageDirection = 'in' | 'out';

/**
 * Customer conversations (mockup's "Hội thoại với khách"): a FLAT list, no
 * threads — a message is "pending" exactly while `reply`/`repliedAt` are
 * NULL. Inbound rows arrive via connector-hub's Zalo webhook (deduped by
 * `sourceEventId`); a reply is RECORDED here, not sent — no real Zalo
 * outbound API exists yet (the mockup itself only enqueues a simulated
 * send), so v1 stores the household's answer and marks the exchange
 * answered, honestly.
 */
export const messages = messagingSchema.table('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  channel: text('channel').$type<MessageChannel>().notNull(),
  direction: text('direction').$type<MessageDirection>().notNull(),
  customerName: text('customer_name').notNull(),
  content: text('content').notNull(),
  sourceEventId: text('source_event_id').notNull(),
  reply: text('reply'),
  repliedAt: timestamp('replied_at', { withTimezone: true }),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
