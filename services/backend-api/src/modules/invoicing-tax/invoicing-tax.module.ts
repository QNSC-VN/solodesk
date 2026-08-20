import { Module } from '@nestjs/common';
import { IdentityTenantModule } from '../identity-tenant/identity-tenant.module';
import { SalesOrderModule } from '../sales-order/sales-order.module';
import { CatalogInventoryModule } from '../catalog-inventory/catalog-inventory.module';
import { NotificationsModule } from '../notifications/notifications.module';
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
  imports: [IdentityTenantModule, SalesOrderModule, CatalogInventoryModule, NotificationsModule],
  controllers: [InvoiceController, InvoicePdfController],
  providers: [
    TaxCalculationService,
    InvoiceService,
    InvoicePdfService,
    { provide: TAX_RULE_REPOSITORY, useClass: TaxRuleDrizzleRepository },
    { provide: INVOICE_REPOSITORY, useClass: InvoiceDrizzleRepository },
  ],
  // INVOICE_REPOSITORY exported too: returns needs IInvoiceRepository
  // directly, same reason ORDER_REPOSITORY/PAYMENT_REPOSITORY are exported.
  // TAX_RULE_REPOSITORY exported for tax-filing: TaxEstimateService reuses
  // the same versioned rate-rule lookup for the HKD exemption threshold,
  // rather than re-querying tax.tax_rules through a second binding.
  exports: [InvoiceService, InvoicePdfService, INVOICE_REPOSITORY, TAX_RULE_REPOSITORY],
})
export class InvoicingTaxModule {}
