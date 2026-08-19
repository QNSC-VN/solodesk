import { uuid, numeric } from 'drizzle-orm/pg-core';
import { purchaseNotes } from './purchase-notes';
import { procurementSchema } from './suppliers';
import { tenants } from './tenants';
import { skus } from './skus';
import { lots } from './lots';

/** `unitCost` is a SNAPSHOT at purchase time — same discipline as `sales.order_lines.unit_price`. */
export const purchaseNoteLines = procurementSchema.table('purchase_note_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  purchaseNoteId: uuid('purchase_note_id').notNull().references(() => purchaseNotes.id),
  skuId: uuid('sku_id').notNull().references(() => skus.id),
  lotId: uuid('lot_id').notNull().references(() => lots.id),
  quantity: numeric('quantity', { precision: 14, scale: 3 }).notNull(),
  unitCost: numeric('unit_cost', { precision: 14, scale: 2 }).notNull(),
  lineTotal: numeric('line_total', { precision: 14, scale: 2 }).notNull(),
});
