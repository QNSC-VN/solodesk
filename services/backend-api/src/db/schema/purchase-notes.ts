import { uuid, text, numeric, timestamp } from 'drizzle-orm/pg-core';
import { procurementSchema, suppliers } from './suppliers';
import { tenants } from './tenants';

export type PurchaseNoteStatus = 'recorded' | 'cancelled';

export const purchaseNotes = procurementSchema.table('purchase_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  supplierId: uuid('supplier_id').notNull().references(() => suppliers.id),
  status: text('status').$type<PurchaseNoteStatus>().notNull().default('recorded'),
  totalAmount: numeric('total_amount', { precision: 14, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
