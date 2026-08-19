import { pgSchema, uuid, text, numeric, timestamp } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { invoices } from './invoices';

export type PaymentMethod = 'cash' | 'bank_transfer' | 'qr' | 'marketplace_settlement';

export const paymentsSchema = pgSchema('payments');

/**
 * `referenceCode` is the bank/QR/marketplace-settlement transaction id —
 * nullable (cash has none) but unique per tenant when present (partial
 * index in the migration), the concrete dedup guard docs Section 7 asks
 * for on inbound payment events, adapted from "unique on provider_event_id."
 */
export const payments = paymentsSchema.table('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  invoiceId: uuid('invoice_id').notNull().references(() => invoices.id),
  method: text('method').$type<PaymentMethod>().notNull(),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  referenceCode: text('reference_code'),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
