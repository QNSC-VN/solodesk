import { pgSchema, uuid, text, jsonb, timestamp, unique } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

/** Cross-cutting — no single domain module owns this (Mục 5.2). */
export const platformSchema = pgSchema('platform');

export const idempotencyKeys = platformSchema.table(
  'idempotency_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    idempotencyKey: text('idempotency_key').notNull(),
    responseBody: jsonb('response_body'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantKey: unique().on(t.tenantId, t.idempotencyKey),
  }),
);
