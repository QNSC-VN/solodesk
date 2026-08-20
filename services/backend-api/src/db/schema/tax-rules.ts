import { pgSchema, uuid, text, numeric, date, timestamp } from 'drizzle-orm/pg-core';

export const taxSchema = pgSchema('tax');

/**
 * Reference data, NOT tenant-scoped — no `tenant_id`, no RLS. Tax rates and
 * the e-invoice revenue threshold are set by the program/tax authority, the
 * same for every tenant, and versioned by `effective_from`/`effective_to`
 * rather than mutated in place (Section 20.5's Strategy pattern: swap the
 * active rule, never overwrite history a past invoice already snapshotted
 * from). `industry = NULL` is the fallback rule used when no industry-specific
 * row is active. Seeded by migration for this first cut — no admin API to
 * edit rates yet, that's a deliberate scope cut, not an oversight.
 */
export const taxRules = taxSchema.table('tax_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  industry: text('industry'), // null = default/fallback — see TenantIndustry for the concrete values
  rate: numeric('rate', { precision: 6, scale: 4 }).notNull(),
  annualRevenueThreshold: numeric('annual_revenue_threshold', { precision: 14, scale: 2 }).notNull(),
  effectiveFrom: date('effective_from', { mode: 'string' }).notNull(),
  effectiveTo: date('effective_to', { mode: 'string' }),
  // The mockup's 200M/year HKD exemption threshold (TAX.nguong.mienThue) —
  // added alongside the pre-existing 1B e-invoice threshold this table
  // already carried. Same "NOT verified statutory" disclaimer applies.
  exemptionAnnualRevenueThreshold: numeric('exemption_annual_revenue_threshold', { precision: 14, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
