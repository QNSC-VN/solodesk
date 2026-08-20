import type { RateGroupCode } from '../../../db/schema/rate-groups';

export type { RateGroupCode };

export interface TaxRateGroup {
  code: RateGroupCode;
  name: string;
  gtgtRate: string;
  tncnRate: string;
  isDraft: boolean;
}

/**
 * `rateGroup` is `null` exactly when the tenant hasn't picked one yet
 * (`Tenant.taxGroupDefault` unset) — the service surfaces that as a clear
 * "not configured" result, never a guessed default rate group.
 */
export interface TaxEstimate {
  quarter: number;
  year: number;
  revenue: string;
  isExempt: boolean;
  gtgt: string;
  tncn: string;
  total: string;
  rateGroup: TaxRateGroup | null;
  filingDeadline: Date;
  isFiled: boolean;
}

export interface Filing {
  id: string;
  tenantId: string;
  quarter: number;
  year: number;
  receiptCode: string;
  filedAt: Date;
}

export interface CreateFilingInput {
  quarter: number;
  year: number;
  receiptCode: string;
}
