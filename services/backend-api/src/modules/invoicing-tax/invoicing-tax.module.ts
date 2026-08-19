import { Module } from '@nestjs/common';
import { IdentityTenantModule } from '../identity-tenant/identity-tenant.module';
import { SalesOrderModule } from '../sales-order/sales-order.module';
import { TaxCalculationService } from './application/tax-calculation.service';
import { InvoiceService } from './application/invoice.service';
import { InvoiceController } from './api/invoice.controller';
import { TaxRuleDrizzleRepository } from './infrastructure/persistence/tax-rule.drizzle-repository';
import { InvoiceDrizzleRepository } from './infrastructure/persistence/invoice.drizzle-repository';
import { TAX_RULE_REPOSITORY } from './domain/ports/tax-rule.repository';
import { INVOICE_REPOSITORY } from './domain/ports/invoice.repository';

@Module({
  imports: [IdentityTenantModule, SalesOrderModule], // needs TenantService (industry) and OrderService (order lookup)
  controllers: [InvoiceController],
  providers: [
    TaxCalculationService,
    InvoiceService,
    { provide: TAX_RULE_REPOSITORY, useClass: TaxRuleDrizzleRepository },
    { provide: INVOICE_REPOSITORY, useClass: InvoiceDrizzleRepository },
  ],
  exports: [InvoiceService],
})
export class InvoicingTaxModule {}
