import type { TenantIndustry } from '../../identity-tenant/domain/tenant.types';

export type InvoiceStatus = 'issued' | 'cancelled';

export interface TaxRule {
  id: string;
  industry: TenantIndustry | null; // null = default/fallback rule
  rate: string;
  annualRevenueThreshold: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface Invoice {
  id: string;
  tenantId: string;
  orderId: string;
  invoiceNumber: string;
  taxRuleId: string;
  subtotal: string;
  taxRate: string;
  taxAmount: string;
  totalAmount: string;
  requiresEInvoice: boolean;
  status: InvoiceStatus;
  issuedAt: Date;
}

export interface TaxCalculationResult {
  taxRule: TaxRule;
  taxAmount: string;
  totalAmount: string;
  requiresEInvoice: boolean;
}
