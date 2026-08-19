import { Inject, Injectable } from '@nestjs/common';
import { NotFoundException } from '@qnsc-vn/platform-http';
import { TAX_RULE_REPOSITORY, type ITaxRuleRepository } from '../domain/ports/tax-rule.repository';
import { multiplyMoney, addMoney } from '../../../platform/money';
import type { TenantIndustry } from '../../identity-tenant/domain/tenant.types';
import type { TaxCalculationResult } from '../domain/invoice.types';

/**
 * Section 20.5's Strategy pattern made concrete: which rate applies is
 * resolved per industry, per effective date, from `tax.tax_rules` — never
 * a hardcoded rate in this class. Deliberately does NOT decide
 * `requiresEInvoice` (that needs cumulative-year revenue across invoices,
 * which is `InvoiceService`'s concern, not a pure rate calculation).
 */
@Injectable()
export class TaxCalculationService {
  constructor(@Inject(TAX_RULE_REPOSITORY) private readonly taxRuleRepository: ITaxRuleRepository) {}

  async calculate(industry: TenantIndustry, subtotal: string, asOf: Date): Promise<Omit<TaxCalculationResult, 'requiresEInvoice'>> {
    const taxRule = await this.taxRuleRepository.findActiveRule(industry, asOf);
    if (!taxRule) {
      throw new NotFoundException('TAX_RULE_NOT_FOUND', `No active tax rule for industry "${industry}" as of ${asOf.toISOString().slice(0, 10)}.`);
    }

    const taxAmount = multiplyMoney(subtotal, taxRule.rate);
    const totalAmount = addMoney(subtotal, taxAmount);

    return { taxRule, taxAmount, totalAmount };
  }
}
