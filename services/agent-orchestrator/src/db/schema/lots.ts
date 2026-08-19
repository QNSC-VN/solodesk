import { uuid, numeric } from 'drizzle-orm/pg-core';
import { catalogSchema } from './skus';

/** READ-ONLY mirror of backend-api's `catalog.lots` — see `orders.ts`'s header comment. */
export const lots = catalogSchema.table('lots', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  skuId: uuid('sku_id').notNull(),
  quantityOnHand: numeric('quantity_on_hand', { precision: 14, scale: 3 }).notNull(),
  quantityReserved: numeric('quantity_reserved', { precision: 14, scale: 3 }).notNull(),
});
