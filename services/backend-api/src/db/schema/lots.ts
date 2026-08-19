import { uuid, text, numeric, timestamp, unique } from 'drizzle-orm/pg-core';
import { catalogSchema } from './skus';
import { tenants } from './tenants';
import { skus } from './skus';

/**
 * A lot/batch of stock for one SKU — the unit traceability and race-safety
 * operate on (Chân dung 1: hồ sơ ATTP/truy xuất theo lô; Chân dung 3: tồn
 * kho theo lô phục vụ truy xuất; Mục 11: chống race "hai đơn cùng tiêu lô cuối").
 *
 * `quantityOnHand` and `quantityReserved` are only ever mutated via the atomic
 * UPDATE-with-guard queries in `lot.drizzle-repository.ts` — never read then
 * written back from application code, which would reintroduce the exact race
 * this table exists to prevent.
 */
export const lots = catalogSchema.table(
  'lots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    skuId: uuid('sku_id').notNull().references(() => skus.id),
    lotCode: text('lot_code').notNull(),
    quantityOnHand: numeric('quantity_on_hand', { precision: 14, scale: 3 }).notNull(),
    quantityReserved: numeric('quantity_reserved', { precision: 14, scale: 3 }).notNull().default('0'),
    sourceChannel: text('source_channel'), // kênh phát sinh lô: 'counter' | 'shopee' | 'purchase_note' | ...
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantLotCode: unique().on(t.tenantId, t.lotCode),
  }),
);
