import type { TenantIndustry } from '../../../identity-tenant/domain/tenant.types';
import type { TaxRule } from '../invoice.types';

export const TAX_RULE_REPOSITORY = Symbol('TAX_RULE_REPOSITORY');

export interface ITaxRuleRepository {
  /** Prefers an industry-specific rule active `asOf`, falls back to the `industry IS NULL` default. */
  findActiveRule(industry: TenantIndustry, asOf: Date): Promise<TaxRule | null>;
}
