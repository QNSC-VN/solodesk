import { Module } from '@nestjs/common';
import { IdentityTenantModule } from '../identity-tenant/identity-tenant.module';
import { InvoicingTaxModule } from '../invoicing-tax/invoicing-tax.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TaxEstimateService } from './application/tax-estimate.service';
import { FilingService } from './application/filing.service';
import { FilingDeadlineSweepService } from './application/filing-deadline-sweep.service';
import { TaxFilingController } from './api/tax-filing.controller';
import { RevenueDrizzleRepository } from './infrastructure/persistence/revenue.drizzle-repository';
import { RateGroupDrizzleRepository } from './infrastructure/persistence/rate-group.drizzle-repository';
import { FilingDrizzleRepository } from './infrastructure/persistence/filing.drizzle-repository';
import { REVENUE_REPOSITORY } from './domain/ports/revenue.repository';
import { RATE_GROUP_REPOSITORY } from './domain/ports/rate-group.repository';
import { FILING_REPOSITORY } from './domain/ports/filing.repository';

@Module({
  // InvoicingTaxModule imported for TAX_RULE_REPOSITORY (the exemption
  // threshold reuses the same versioned tax.tax_rules lookup
  // TaxCalculationService itself uses). NotificationsModule for
  // FilingDeadlineSweepService's real notify() call.
  imports: [IdentityTenantModule, InvoicingTaxModule, NotificationsModule],
  controllers: [TaxFilingController],
  providers: [
    TaxEstimateService,
    FilingService,
    FilingDeadlineSweepService,
    { provide: REVENUE_REPOSITORY, useClass: RevenueDrizzleRepository },
    { provide: RATE_GROUP_REPOSITORY, useClass: RateGroupDrizzleRepository },
    { provide: FILING_REPOSITORY, useClass: FilingDrizzleRepository },
  ],
  // FilingDeadlineSweepService exported for the notifications worker
  // (services/backend-api/src/worker-notifications.ts) to resolve from
  // the same NestFactory.createApplicationContext(AppModule) it already builds.
  exports: [TaxEstimateService, FilingService, FilingDeadlineSweepService],
})
export class TaxFilingModule {}
