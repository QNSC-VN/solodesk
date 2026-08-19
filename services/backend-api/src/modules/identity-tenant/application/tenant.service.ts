import { Inject, Injectable } from '@nestjs/common';
import { NotFoundException } from '@qnsc-vn/platform-http';
import { assertTenantMatchesSession } from '../../../platform/tenant-context';
import {
  TENANT_REPOSITORY,
  TENANT_MEMBER_REPOSITORY,
  type ITenantRepository,
  type ITenantMemberRepository,
} from '../domain/ports/tenant.repository';
import type { Tenant, CreateTenantInput, UpdateTenantProfileInput, TenantMember } from '../domain/tenant.types';

@Injectable()
export class TenantService {
  constructor(
    @Inject(TENANT_REPOSITORY) private readonly tenantRepository: ITenantRepository,
    @Inject(TENANT_MEMBER_REPOSITORY) private readonly memberRepository: ITenantMemberRepository,
  ) {}

  /** Onboarding path — not tenant-scoped by definition, runs before a tenant context exists. */
  async createTenant(input: CreateTenantInput): Promise<Tenant> {
    return this.tenantRepository.create(input);
  }

  async activateTenant(id: string): Promise<Tenant> {
    return this.tenantRepository.activate(id);
  }

  /**
   * `tenantId` here is the CALLER-supplied argument — e.g. from an MCP tool
   * invocation or a path param. `assertTenantMatchesSession` is Section 4.4's
   * defense-in-depth: reject before touching the DB if it doesn't match the
   * session's own tenant context, independent of whatever RLS would also do.
   */
  async listMembers(tenantId: string): Promise<TenantMember[]> {
    assertTenantMatchesSession(tenantId);
    return this.memberRepository.listByTenant(tenantId);
  }

  async getTenant(id: string): Promise<Tenant> {
    const tenant = await this.tenantRepository.findById(id);
    if (!tenant) {
      throw new NotFoundException('TENANT_NOT_FOUND', `Tenant ${id} not found`);
    }
    return tenant;
  }

  /**
   * The AI onboarding copilot's `set_business_profile` tool calls this —
   * refines a placeholder profile from staff-assisted pre-registration into
   * the real business details, gathered conversationally (Mục IV.6 "cầm tay
   * chỉ việc"). Called service-to-service (agent-orchestrator has no
   * per-user JWT for a machine caller), same `internal/*` + `InternalServiceGuard`
   * shape as `payment-reconcile`'s forwarding endpoint — see
   * `internal-onboarding.controller.ts`.
   */
  async updateProfile(id: string, input: UpdateTenantProfileInput): Promise<Tenant> {
    await this.getTenant(id); // 404s if missing, same fail-loud shape as everywhere else
    return this.tenantRepository.updateProfile(id, input);
  }
}
