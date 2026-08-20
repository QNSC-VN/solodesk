import { pgSchema, uuid, text, numeric, boolean, timestamp } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

export const expensesSchema = pgSchema('expenses');

/** The mockup's own fixed LOAI_CHI set — closed, no user-defined categories. */
export type ExpenseCategory = 'bao-bi' | 'van-chuyen' | 'dien-nuoc' | 'mat-bang' | 'nhan-cong' | 'thiet-bi' | 'nguyen-lieu' | 'khac';

/** The mockup's own chungTu field — documentation backing the spend. */
export type ExpenseDocumentation = 'hoa-don' | 'phieu-chi' | 'khong';

/**
 * Non-inventory operating spend (packaging, transport/fuel, utilities,
 * rent, labor, equipment, raw materials bought without a formal purchase
 * note, other) — genuinely separate from `procurement`'s `PurchaseNote`
 * (which always ties to a SKU/lot and receives real stock). See
 * migration `0016`'s own header comment for the full reasoning.
 */
export const expenses = expensesSchema.table('expenses', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  category: text('category').$type<ExpenseCategory>().notNull(),
  description: text('description').notNull(),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  documentation: text('documentation').$type<ExpenseDocumentation>().notNull().default('khong'),
  supplierName: text('supplier_name'),
  isPersonalWallet: boolean('is_personal_wallet').notNull().default(false),
  spentAt: timestamp('spent_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
