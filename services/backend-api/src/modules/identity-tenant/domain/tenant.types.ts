export type TenantIndustry = 'food_beverage' | 'tourism' | 'agriculture';
export type TenantMemberRole = 'owner' | 'successor' | 'accountant_delegate';

export interface Tenant {
  id: string;
  legalName: string;
  industry: TenantIndustry;
  province: string;
  activatedAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTenantInput {
  legalName: string;
  industry: TenantIndustry;
  province?: string;
}

export interface TenantMember {
  id: string;
  tenantId: string;
  userId: string;
  displayName: string;
  role: TenantMemberRole;
  canEdit: boolean;
}
