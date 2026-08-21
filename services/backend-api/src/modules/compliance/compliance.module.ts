import { Module } from '@nestjs/common';
import { IdentityTenantModule } from '../identity-tenant/identity-tenant.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ComplianceService } from './application/compliance.service';
import { DocExpirySweepService } from './application/doc-expiry-sweep.service';
import { ComplianceController } from './api/compliance.controller';
import { ComplianceDrizzleRepository } from './infrastructure/persistence/compliance.drizzle-repository';
import { COMPLIANCE_REPOSITORY } from './domain/ports/compliance.repository';

@Module({
  imports: [IdentityTenantModule, NotificationsModule],
  controllers: [ComplianceController],
  providers: [ComplianceService, DocExpirySweepService, { provide: COMPLIANCE_REPOSITORY, useClass: ComplianceDrizzleRepository }],
  exports: [DocExpirySweepService],
})
export class ComplianceModule {}
