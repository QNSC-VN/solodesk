import { pgSchema, uuid, text, timestamp, boolean } from 'drizzle-orm/pg-core';

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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
