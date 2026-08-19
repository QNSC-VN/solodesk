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
  exports: [TenantService],
})
export class IdentityTenantModule {}
