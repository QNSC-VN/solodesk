import { Injectable } from '@nestjs/common';
import { and, or, eq, isNull, lte, gte, asc, sql } from 'drizzle-orm';
import { db } from '../../../../db/client';
import { taxRules } from '../../../../db/schema/tax-rules';
import type { TenantIndustry } from '../../../identity-tenant/domain/tenant.types';
import type { ITaxRuleRepository } from '../../domain/ports/tax-rule.repository';
import type { TaxRule } from '../../domain/invoice.types';

function toDomain(row: typeof taxRules.$inferSelect): TaxRule {
  return {
    id: row.id,
    industry: row.industry as TenantIndustry | null,
    rate: row.rate,
    annualRevenueThreshold: row.annualRevenueThreshold,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
  };
}

@Injectable()
export class TaxRuleDrizzleRepository implements ITaxRuleRepository {
  async findActiveRule(industry: TenantIndustry, asOf: Date): Promise<TaxRule | null> {
    const asOfDate = asOf.toISOString().slice(0, 10);
    const rows = await db
      .select()
      .from(taxRules)
      .where(
        and(
          or(eq(taxRules.industry, industry), isNull(taxRules.industry)),
          lte(taxRules.effectiveFrom, asOfDate),
          or(isNull(taxRules.effectiveTo), gte(taxRules.effectiveTo, asOfDate)),
        ),
      )
      // Industry-specific rows sort before the NULL fallback.
      .orderBy(asc(sql`${taxRules.industry} IS NULL`), asc(taxRules.effectiveFrom))
      .limit(1);
    return rows[0] ? toDomain(rows[0]) : null;
  }
}
