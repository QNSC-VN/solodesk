import { Module } from '@nestjs/common';
import { TenantService } from './application/tenant.service';
import { TenantController } from './api/tenant.controller';
import { InternalOnboardingTenantController } from './api/internal-onboarding.controller';
import { TenantDrizzleRepository } from './infrastructure/persistence/tenant.drizzle-repository';
import { TenantMemberDrizzleRepository } from './infrastructure/persistence/tenant-member.drizzle-repository';
import { TENANT_REPOSITORY, TENANT_MEMBER_REPOSITORY } from './domain/ports/tenant.repository';

@Module({
  controllers: [TenantController, InternalOnboardingTenantController],
  providers: [
    TenantService,
    { provide: TENANT_REPOSITORY, useClass: TenantDrizzleRepository },
    { provide: TENANT_MEMBER_REPOSITORY, useClass: TenantMemberDrizzleRepository },
  ],
  // TENANT_REPOSITORY/TENANT_MEMBER_REPOSITORY exported for the new auth
  // module's signup flow, which composes tenant+user+owner-membership in one
  // transaction — same repository-to-repository composition at the
  // application layer as OrderService injecting LOT_REPOSITORY/SKU_REPOSITORY
  // directly (sales-order), not through another module's service.
  exports: [TenantService, TENANT_REPOSITORY, TENANT_MEMBER_REPOSITORY],
})
export class IdentityTenantModule {}
