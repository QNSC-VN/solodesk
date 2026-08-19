import { uuid, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { vaultSchema } from './credentials';

/** Deliberately NO RLS — see this table's migration header comment. Contains no secret material, only a token->(tenant,provider) mapping. */
export const webhookTokens = vaultSchema.table(
  'webhook_tokens',
  {
    token: uuid('token').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    provider: text('provider').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantProvider: unique().on(t.tenantId, t.provider),
  }),
);
