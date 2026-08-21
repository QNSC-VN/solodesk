import { Inject, Injectable } from '@nestjs/common';
import { assertTenantMatchesSession } from '../../../platform/tenant-context';
import { multiplyMoney, addMoney, compareMoney } from '../../../platform/money';
import { yearWindowUtc } from '../../../platform/vn-time';
import { REVENUE_REPOSITORY, type IRevenueRepository } from '../domain/ports/revenue.repository';
import { RATE_GROUP_REPOSITORY, type IRateGroupRepository } from '../domain/ports/rate-group.repository';
import { FILING_REPOSITORY, type IFilingRepository } from '../domain/ports/filing.repository';
import { TAX_RULE_REPOSITORY, type ITaxRuleRepository } from '../../invoicing-tax/domain/ports/tax-rule.repository';
import { TenantService } from '../../identity-tenant/application/tenant.service';
import { currentQuarter, quarterWindowUtc, filingDeadline } from '../domain/filing-period';
import type { TaxEstimate } from '../domain/tax-filing.types';

/**
 * The mockup's `taxEstimate()` (HKD branch only — see this module's own
 * scope note for why DN/enterprise is cut) ported as a real service:
 * revenue is summed from real confirmed orders for the VN calendar
 * quarter, not simulated; the rate group and exemption threshold both come
 * from real reference data, never a hardcoded number in this class
 * (`platform/money`'s exact-decimal helpers, reused from
 * `TaxCalculationService` rather than reimplemented).
 */
@Injectable()
export class TaxEstimateService {
  constructor(
    @Inject(REVENUE_REPOSITORY) private readonly revenueRepository: IRevenueRepository,
    @Inject(RATE_GROUP_REPOSITORY) private readonly rateGroupRepository: IRateGroupRepository,
    @Inject(FILING_REPOSITORY) private readonly filingRepository: IFilingRepository,
    @Inject(TAX_RULE_REPOSITORY) private readonly taxRuleRepository: ITaxRuleRepository,
    private readonly tenantService: TenantService,
  ) {}

  async estimateQuarter(tenantId: string, quarter?: number, year?: number): Promise<TaxEstimate> {
    assertTenantMatchesSession(tenantId);

    const now = new Date();
    const period = quarter !== undefined && year !== undefined ? { quarter, year } : currentQuarter(now);
    const { start, end } = quarterWindowUtc(period.quarter, period.year);

    const tenant = await this.tenantService.getTenant(tenantId);
    const yearStart = yearWindowUtc(period.year).start;
    const [revenue, yearToDateRevenue, taxRule, filing] = await Promise.all([
      this.revenueRepository.sumConfirmedRevenue(tenantId, start, end),
      // The mockup's `mienThue` gate is a YEAR-cumulative check
      // (`yearRev <= 200M`), not a per-quarter one — this quarter's own
      // revenue is still what gets taxed once that gate is open, same
      // split the mockup itself makes.
      this.revenueRepository.sumConfirmedRevenue(tenantId, yearStart, end),
      this.taxRuleRepository.findActiveRule(tenant.industry, now),
      this.filingRepository.findByPeriod(tenantId, period.quarter, period.year),
    ]);

    const rateGroup = tenant.taxGroupDefault ? await this.rateGroupRepository.findByCode(tenant.taxGroupDefault) : null;
    const isExempt = taxRule ? compareMoney(yearToDateRevenue, taxRule.exemptionAnnualRevenueThreshold) < 0 : false;

    const gtgt = rateGroup && !isExempt ? multiplyMoney(revenue, rateGroup.gtgtRate) : '0.00';
    const tncn = rateGroup && !isExempt ? multiplyMoney(revenue, rateGroup.tncnRate) : '0.00';

    return {
      quarter: period.quarter,
      year: period.year,
      revenue,
      isExempt,
      gtgt,
      tncn,
      total: addMoney(gtgt, tncn),
      rateGroup,
      filingDeadline: filingDeadline(period.quarter, period.year),
      isFiled: filing !== null,
    };
  }
}
