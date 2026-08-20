import { uuid, integer, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { taxSchema } from './tax-rules';
import { tenants } from './tenants';

/**
 * One row per quarter a household has recorded as filed — the mockup's own
 * `t.taxFiled`/`t.taxReceipts` array-push, as a real DB row instead. UNIQUE
 * on (tenant_id, quarter, year): filing the same quarter twice is a DB-level
 * rejection, not an app-level check. `receiptCode` has no format
 * validation — no real eTax API exists yet to validate against, same as
 * the mockup's own real behavior.
 */
export const filings = taxSchema.table(
  'filings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    quarter: integer('quarter').notNull(),
    year: integer('year').notNull(),
    receiptCode: text('receipt_code').notNull(),
    filedAt: timestamp('filed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantQuarterYear: unique().on(t.tenantId, t.quarter, t.year),
  }),
);
