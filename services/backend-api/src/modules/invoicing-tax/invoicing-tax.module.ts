import { Module } from '@nestjs/common';
import { IdentityTenantModule } from '../identity-tenant/identity-tenant.module';
import { SalesOrderModule } from '../sales-order/sales-order.module';
import { CatalogInventoryModule } from '../catalog-inventory/catalog-inventory.module';
import { TaxCalculationService } from './application/tax-calculation.service';
import { InvoiceService } from './application/invoice.service';
import { InvoicePdfService } from './application/invoice-pdf.service';
import { InvoiceController } from './api/invoice.controller';
import { InvoicePdfController } from './api/invoice-pdf.controller';
import { TaxRuleDrizzleRepository } from './infrastructure/persistence/tax-rule.drizzle-repository';
import { InvoiceDrizzleRepository } from './infrastructure/persistence/invoice.drizzle-repository';
import { TAX_RULE_REPOSITORY } from './domain/ports/tax-rule.repository';
import { INVOICE_REPOSITORY } from './domain/ports/invoice.repository';

@Module({
  // CatalogInventoryModule needed directly (not re-exported by
  // SalesOrderModule, which only exports OrderService) — InvoicePdfService
  // resolves SKU names for line items via CatalogService.
  imports: [IdentityTenantModule, SalesOrderModule, CatalogInventoryModule],
  controllers: [InvoiceController, InvoicePdfController],
  providers: [
    TaxCalculationService,
    InvoiceService,
    InvoicePdfService,
    { provide: TAX_RULE_REPOSITORY, useClass: TaxRuleDrizzleRepository },
    { provide: INVOICE_REPOSITORY, useClass: InvoiceDrizzleRepository },
  ],
  exports: [InvoiceService, InvoicePdfService],
})
export class InvoicingTaxModule {}
