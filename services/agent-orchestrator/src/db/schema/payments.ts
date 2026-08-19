import { uuid, numeric } from 'drizzle-orm/pg-core';
import { pgSchema } from 'drizzle-orm/pg-core';

/** READ-ONLY mirror of backend-api's `payments.payments` — see `orders.ts`'s header comment. */
export const paymentsSchema = pgSchema('payments');

export const payments = paymentsSchema.table('payments', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  invoiceId: uuid('invoice_id').notNull(),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
});
