import type { Tenant, CreateTenantInput, TenantMember } from '../tenant.types';

export const TENANT_REPOSITORY = Symbol('TENANT_REPOSITORY');

/**
 * Note the asymmetry versus every other module's repository ports: `tenants`
 * itself is not RLS-scoped (it IS the tenant list — see
 * db/migrations/0001_init_identity_schema.sql), so these methods take no
 * tenantId parameter. `ITenantMemberRepository` below is the tenant-scoped
 * one, and its methods carry tenantId exactly like every future domain
 * module's repository must.
 */
export interface ITenantRepository {
  findById(id: string): Promise<Tenant | null>;
  create(input: CreateTenantInput): Promise<Tenant>;
  activate(id: string): Promise<Tenant>;
}

export const TENANT_MEMBER_REPOSITORY = Symbol('TENANT_MEMBER_REPOSITORY');

export interface ITenantMemberRepository {
  listByTenant(tenantId: string): Promise<TenantMember[]>;
  findByUserId(tenantId: string, userId: string): Promise<TenantMember | null>;
  add(member: Omit<TenantMember, 'id'>): Promise<TenantMember>;
}
