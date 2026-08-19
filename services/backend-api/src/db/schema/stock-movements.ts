import { uuid, text, numeric, timestamp } from 'drizzle-orm/pg-core';
import { catalogSchema } from './skus';
import { tenants } from './tenants';
import { lots } from './lots';

export type StockMovementType = 'receipt' | 'consumption' | 'adjustment' | 'reservation' | 'release' | 'return';

/**
 * Append-only audit trail of every stock change — the "ai sửa gì" ledger
 * (Mục 11) for inventory specifically, and the natural outbox-event source
 * once CQRS/B2G aggregation (Mục 6/16) needs `stock.changed` events.
 * `referenceType`/`referenceId` are loose (no FK) on purpose — this module
 * must not hard-depend on `sales-order` before that module exists.
 */
export const stockMovements = catalogSchema.table('stock_movements', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  lotId: uuid('lot_id').notNull().references(() => lots.id),
  movementType: text('movement_type').$type<StockMovementType>().notNull(),
  quantity: numeric('quantity', { precision: 14, scale: 3 }).notNull(),
  referenceType: text('reference_type'),
  referenceId: uuid('reference_id'),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
