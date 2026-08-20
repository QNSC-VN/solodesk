import { text, numeric, boolean } from 'drizzle-orm/pg-core';
import { taxSchema } from './tax-rules';

export type RateGroupCode = 'phanPhoi' | 'sanXuat' | 'dichVu' | 'khac';

/**
 * Reference data, NOT tenant-scoped — no `tenant_id`, no RLS, same shape as
 * `tax.tax_rules`. The 4 statutory rate-groups an HKD revenue line is
 * classified into — a DIFFERENT axis from `TenantIndustry` (business
 * sector) — see this migration's own comment (`0015`) for the full
 * reasoning. No effective-dating: new data with no history to version yet.
 */
export const rateGroups = taxSchema.table('rate_groups', {
  code: text('code').$type<RateGroupCode>().primaryKey(),
  name: text('name').notNull(),
  gtgtRate: numeric('gtgt_rate', { precision: 6, scale: 4 }).notNull(),
  tncnRate: numeric('tncn_rate', { precision: 6, scale: 4 }).notNull(),
  isDraft: boolean('is_draft').notNull().default(true),
});
