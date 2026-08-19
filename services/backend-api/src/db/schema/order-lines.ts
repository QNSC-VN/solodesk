import { uuid, text, numeric } from 'drizzle-orm/pg-core';
import { salesSchema, orders } from './orders';
import { tenants } from './tenants';
import { skus } from './skus';
import { lots } from './lots';

export const orderLines = salesSchema.table('order_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  orderId: uuid('order_id').notNull().references(() => orders.id),
  skuId: uuid('sku_id').notNull().references(() => skus.id),
  lotId: uuid('lot_id').notNull().references(() => lots.id),
  quantity: numeric('quantity', { precision: 14, scale: 3 }).notNull(),
  // Snapshot, not a live FK-joined price — see orders.ts's header comment.
  unitPrice: numeric('unit_price', { precision: 14, scale: 2 }).notNull(),
  lineTotal: numeric('line_total', { precision: 14, scale: 2 }).notNull(),
});
