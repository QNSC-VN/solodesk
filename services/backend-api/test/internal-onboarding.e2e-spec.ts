import { describe, it, expect } from 'vitest';
import { db } from '../src/db/client';
import { tenants } from '../src/db/schema/tenants';
import { TenantDrizzleRepository } from '../src/modules/identity-tenant/infrastructure/persistence/tenant.drizzle-repository';
import { TenantMemberDrizzleRepository } from '../src/modules/identity-tenant/infrastructure/persistence/tenant-member.drizzle-repository';
import { TenantService } from '../src/modules/identity-tenant/application/tenant.service';

/**
 * Real Postgres, no mocks — `TenantService.updateProfile`, the service
 * logic behind `InternalOnboardingTenantController` (agent-orchestrator's
 * `set_business_profile` onboarding tool). The HTTP-level
 * `InternalServiceGuard` itself is verified against a live dev server, same
 * convention as `internal-payment-forwarding.e2e-spec.ts`'s own header
 * comment — no supertest-style harness in this repo.
 */

const tenantService = new TenantService(new TenantDrizzleRepository(), new TenantMemberDrizzleRepository());

async function seedTenant(legalName: string) {
  const [tenant] = await db.insert(tenants).values({ legalName, industry: 'food_beverage' }).returning();
  return tenant!.id;
}

describe('TenantService.updateProfile — real Postgres, no mocks', () => {
  it('updates both legalName and industry', async () => {
    const tenantId = await seedTenant('Onboarding Test Tenant Placeholder');

    const updated = await tenantService.updateProfile(tenantId, { legalName: 'Quán Cà Phê Út Bảy', industry: 'agriculture' });

    expect(updated.legalName).toBe('Quán Cà Phê Út Bảy');
    expect(updated.industry).toBe('agriculture');
  });

  it('a partial update (industry only) leaves legalName untouched', async () => {
    const tenantId = await seedTenant('Onboarding Test Tenant Partial');

    const updated = await tenantService.updateProfile(tenantId, { industry: 'tourism' });

    expect(updated.legalName).toBe('Onboarding Test Tenant Partial');
    expect(updated.industry).toBe('tourism');
  });

  it('an unknown tenant id 404s rather than silently no-op-ing', async () => {
    await expect(tenantService.updateProfile('00000000-0000-0000-0000-000000000000', { industry: 'tourism' })).rejects.toThrow();
  });
});

describe('TenantService.activateTenant — real Postgres, no mocks', () => {
  it('sets activatedAt on a freshly-seeded tenant that starts with it null — the one signal a client checks to know onboarding is done', async () => {
    const tenantId = await seedTenant('Onboarding Test Tenant Activation');

    const before = await tenantService.getTenant(tenantId);
    expect(before.activatedAt).toBeNull();

    const activated = await tenantService.activateTenant(tenantId);

    expect(activated.activatedAt).toBeInstanceOf(Date);
  });
});
