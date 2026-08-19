import { pgSchema, uuid, text, numeric, boolean, timestamp, unique } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

/** Same bounded context as Mục 2's "Catalog & Inventory" — SKU + lots + movements live together. */
export const catalogSchema = pgSchema('catalog');

export const skus = catalogSchema.table(
  'skus',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    skuCode: text('sku_code').notNull(),
    name: text('name').notNull(),
    unit: text('unit').notNull(), // đơn vị tính: kg, chai, phần, chuyến...
    category: text('category'),
    unitPrice: numeric('unit_price', { precision: 14, scale: 2 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantSkuCode: unique().on(t.tenantId, t.skuCode),
  }),
);
