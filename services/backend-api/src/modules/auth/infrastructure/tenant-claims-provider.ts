import { Inject, Injectable } from '@nestjs/common';
import type { IClaimsProvider, ProductClaims } from '@qnsc-vn/identity';
import { TENANT_MEMBER_REPOSITORY, type ITenantMemberRepository } from '../../identity-tenant/domain/ports/tenant.repository';

/**
 * SoloDesk's authorization model is just `tenant_members.role` — no RBAC/
 * PBAC yet, so claims are a single `role` string, resolved fresh on every
 * token mint/rotation (bounded by the access-token TTL, per the port's own
 * contract).
 */
@Injectable()
export class TenantClaimsProvider implements IClaimsProvider {
  constructor(@Inject(TENANT_MEMBER_REPOSITORY) private readonly memberRepository: ITenantMemberRepository) {}

  async getClaims(userId: string, contextId?: string | null): Promise<ProductClaims> {
    if (!contextId) return { role: null };
    const member = await this.memberRepository.findByUserId(contextId, userId);
    return { role: member?.role ?? null };
  }
}
