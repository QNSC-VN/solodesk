import { uuid, text, numeric, timestamp } from 'drizzle-orm/pg-core';
import { salesSchema, orders } from './orders';
import { tenants } from './tenants';
import { invoices } from './invoices';

export type ReturnStatus = 'completed';
export type ReturnRefundMethod = 'cash' | 'bank_transfer' | 'qr' | 'marketplace_settlement';

/**
 * Full-order reversal — v1 scope, stated plainly: no partial-line returns
 * (invoices have no line-item structure of their own to reverse
 * partially) and no separate "exchange" concept (a return + a new order
 * achieves the same real outcome). One row per completed return, the real
 * audit record of "a return happened, why, how much was refunded."
 */
export const returns = salesSchema.table('returns', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id),
  invoiceId: uuid('invoice_id')
    .notNull()
    .references(() => invoices.id),
  reason: text('reason').notNull(),
  refundAmount: numeric('refund_amount', { precision: 14, scale: 2 }).notNull(),
  refundMethod: text('refund_method').$type<ReturnRefundMethod>(),
  status: text('status').$type<ReturnStatus>().notNull().default('completed'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
