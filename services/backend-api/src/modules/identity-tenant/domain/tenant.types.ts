import type { RateGroupCode } from '../../../db/schema/rate-groups';

export type TenantIndustry = 'food_beverage' | 'tourism' | 'agriculture';
export type TenantMemberRole = 'owner' | 'successor' | 'accountant_delegate';

export interface Tenant {
  id: string;
  legalName: string;
  industry: TenantIndustry;
  province: string;
  activatedAt: Date | null;
  isActive: boolean;
  // Which tax.rate_groups row this household's revenue is classified under
  // — null = not set up yet, a real state (see migration 0015).
  taxGroupDefault: RateGroupCode | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTenantInput {
  legalName: string;
  industry: TenantIndustry;
  province?: string;
}

/** The AI onboarding copilot's `set_business_profile` tool — refines a placeholder profile from the pre-registration step into the real business details, conversationally. */
export interface UpdateTenantProfileInput {
  legalName?: string;
  industry?: TenantIndustry;
  taxGroupDefault?: RateGroupCode;
}

export interface TenantMember {
  id: string;
  tenantId: string;
  userId: string;
  displayName: string;
  role: TenantMemberRole;
  canEdit: boolean;
}
