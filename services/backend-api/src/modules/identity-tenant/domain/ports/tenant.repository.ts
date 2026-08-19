import type { Db } from '../../../../db/client';
import type { Tenant, CreateTenantInput, UpdateTenantProfileInput, TenantMember } from '../tenant.types';

export const TENANT_REPOSITORY = Symbol('TENANT_REPOSITORY');

/**
 * Note the asymmetry versus every other module's repository ports: `tenants`
 * itself is not RLS-scoped (it IS the tenant list — see
 * db/migrations/0001_init_identity_schema.sql), so these methods take no
 * tenantId parameter. `ITenantMemberRepository` below is the tenant-scoped
 * one, and its methods carry tenantId exactly like every future domain
 * module's repository must.
 *
 * `create`'s optional trailing `tx` (added for real-login signup, which
 * spans tenant + user + owner-membership in one transaction — same
 * precedented "optional trailing tx" convention as `ILotRepository.receive`)
 * defaults to the module-level `db` when omitted, same as every other
 * caller before this.
 */
export interface ITenantRepository {
  findById(id: string): Promise<Tenant | null>;
  create(input: CreateTenantInput, tx?: Db): Promise<Tenant>;
  activate(id: string): Promise<Tenant>;
  updateProfile(id: string, input: UpdateTenantProfileInput): Promise<Tenant>;
}

export const TENANT_MEMBER_REPOSITORY = Symbol('TENANT_MEMBER_REPOSITORY');

export interface ITenantMemberRepository {
  listByTenant(tenantId: string): Promise<TenantMember[]>;
  findByUserId(tenantId: string, userId: string): Promise<TenantMember | null>;
  add(member: Omit<TenantMember, 'id'>, tx?: Db): Promise<TenantMember>;
  /**
   * The one deliberate exception to "tenant_members needs tenant context
   * first" — queries the non-RLS `user_tenant_memberships` index instead
   * (maintained by `add`, in the same transaction), for the one legitimate
   * case that needs it: resolving a user's tenant(s) at login time, before
   * any tenant context can exist. See CLAUDE.md's "Real login" section.
   */
  findTenantIdsForUser(userId: string): Promise<string[]>;
}
