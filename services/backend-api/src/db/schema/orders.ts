import { pgSchema, uuid, text, numeric, timestamp } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

export type OrderChannel = 'counter' | 'shopee' | 'tiktok_shop' | 'lazada' | 'phone' | 'other';
export type OrderStatus = 'confirmed' | 'cancelled' | 'returned';

export const salesSchema = pgSchema('sales');

/**
 * `unitPrice` on each line (see order-lines.ts) is a SNAPSHOT at order time,
 * never a live join to `catalog.skus.unit_price` — Mục 11's named risk
 * "giữ giá đơn treo khi đổi giá sản phẩm" (a price change must never alter
 * an already-placed order's total).
 */
export const orders = salesSchema.table('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  channel: text('channel').$type<OrderChannel>().notNull(),
  status: text('status').$type<OrderStatus>().notNull().default('confirmed'),
  customerName: text('customer_name'),
  totalAmount: numeric('total_amount', { precision: 14, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
