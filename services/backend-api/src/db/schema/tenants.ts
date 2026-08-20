import { pgSchema, uuid, text, timestamp, boolean } from 'drizzle-orm/pg-core';
import { rateGroups } from './rate-groups';

/**
 * Dedicated schema so `identity.*` tables are trivially distinguishable from
 * every other domain module's tables in `pg_catalog` and in backups.
 */
export const identitySchema = pgSchema('identity');

/**
 * A tenant is one household/business (hộ kinh doanh / doanh nghiệp) — the row
 * every RLS policy in every other schema keys off via `tenant_id`.
 */
export const tenants = identitySchema.table('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  legalName: text('legal_name').notNull(),
  industry: text('industry').notNull(), // 'food_beverage' | 'tourism' | 'agriculture' — see TenantIndustry
  province: text('province').notNull().default('gia_lai'),
  activatedAt: timestamp('activated_at', { withTimezone: true }),
  isActive: boolean('is_active').notNull().default(true),
  // Which single tax.rate_groups row this household's revenue is classified
  // under — v1's deliberate simplification of the mockup's real per-line/
  // per-SKU attribution chain (see migration 0015). NULL = not set up yet,
  // a real state, never a guessed default.
  taxGroupDefault: text('tax_group_default').references(() => rateGroups.code),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
