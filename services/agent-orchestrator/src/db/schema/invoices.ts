import { uuid, text, numeric, timestamp } from 'drizzle-orm/pg-core';
import { pgSchema } from 'drizzle-orm/pg-core';

/** READ-ONLY mirror of backend-api's `tax.invoices` — see `orders.ts`'s header comment. */
export const taxSchema = pgSchema('tax');

export const invoices = taxSchema.table('invoices', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  invoiceNumber: text('invoice_number').notNull(),
  totalAmount: numeric('total_amount', { precision: 14, scale: 2 }).notNull(),
  status: text('status').notNull(),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull(),
});
