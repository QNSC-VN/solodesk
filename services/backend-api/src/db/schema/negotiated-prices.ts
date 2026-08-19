import { uuid, numeric, date, timestamp } from 'drizzle-orm/pg-core';
import { procurementSchema, suppliers } from './suppliers';
import { tenants } from './tenants';
import { skus } from './skus';

/**
 * Per-tenant (unlike `tax.tax_rules`, which is program-wide reference data)
 * — a supplier's negotiated cost is that tenant's own business relationship.
 * Same versioning discipline as everywhere else: `effective_to = NULL` is
 * the current active price; setting a new one closes the old row rather
 * than overwriting it, so a past purchase note's snapshotted `unit_cost`
 * stays correct even after the negotiated rate changes.
 */
export const negotiatedPrices = procurementSchema.table('negotiated_prices', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  supplierId: uuid('supplier_id').notNull().references(() => suppliers.id),
  skuId: uuid('sku_id').notNull().references(() => skus.id),
  unitCost: numeric('unit_cost', { precision: 14, scale: 2 }).notNull(),
  effectiveFrom: date('effective_from', { mode: 'string' }).notNull(),
  effectiveTo: date('effective_to', { mode: 'string' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
