import { pgSchema, uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

/** Mục 2's "Procurement" — farmer/input-supplier purchase ledger. */
export const procurementSchema = pgSchema('procurement');

export const suppliers = procurementSchema.table('suppliers', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  contactInfo: text('contact_info'),
  taxCode: text('tax_code'), // often absent for an individual farmer, not a registered business
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
