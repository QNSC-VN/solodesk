import { uuid, text, numeric, boolean } from 'drizzle-orm/pg-core';
import { pgSchema } from 'drizzle-orm/pg-core';

/** READ-ONLY mirror of backend-api's `catalog.skus` — see `orders.ts`'s header comment. */
export const catalogSchema = pgSchema('catalog');

export const skus = catalogSchema.table('skus', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  skuCode: text('sku_code').notNull(),
  name: text('name').notNull(),
  unitPrice: numeric('unit_price', { precision: 14, scale: 2 }).notNull(),
  isActive: boolean('is_active').notNull(),
});
