import { uuid, text, numeric, boolean, timestamp } from 'drizzle-orm/pg-core';
import { taxSchema, taxRules } from './tax-rules';
import { tenants } from './tenants';
import { orders } from './orders';

export type InvoiceStatus = 'issued' | 'cancelled';

/**
 * One invoice per order (YAGNI: no multi-order or partial invoices in this
 * cut) — enforced by `UNIQUE (tenant_id, order_id)` in the migration.
 * `taxRate`/`requiresEInvoice` are SNAPSHOTS at issue time, same discipline
 * as `sales.order_lines.unit_price`: a later change to `tax.tax_rules` must
 * never alter an already-issued invoice's numbers.
 */
export const invoices = taxSchema.table('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  orderId: uuid('order_id').notNull().references(() => orders.id),
  invoiceNumber: text('invoice_number').notNull(),
  taxRuleId: uuid('tax_rule_id').notNull().references(() => taxRules.id),
  subtotal: numeric('subtotal', { precision: 14, scale: 2 }).notNull(),
  taxRate: numeric('tax_rate', { precision: 6, scale: 4 }).notNull(),
  taxAmount: numeric('tax_amount', { precision: 14, scale: 2 }).notNull(),
  totalAmount: numeric('total_amount', { precision: 14, scale: 2 }).notNull(),
  // Whether cumulative issued revenue THIS CALENDAR YEAR (including this
  // invoice) crosses the tax rule's annual e-invoice threshold — the concrete
  // "1 tỷ VND/year" check from docs Section 5/20.4, not a per-invoice amount
  // check (a single invoice almost never reaches it on its own).
  requiresEInvoice: boolean('requires_e_invoice').notNull(),
  status: text('status').$type<InvoiceStatus>().notNull().default('issued'),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
