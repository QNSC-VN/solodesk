import { Module } from '@nestjs/common';
import { SalesOrderModule } from '../sales-order/sales-order.module';
import { InvoicingTaxModule } from '../invoicing-tax/invoicing-tax.module';
import { PaymentReconcileModule } from '../payment-reconcile/payment-reconcile.module';
import { CatalogInventoryModule } from '../catalog-inventory/catalog-inventory.module';
import { ReturnService } from './application/return.service';
import { ReturnController } from './api/return.controller';
import { ReturnDrizzleRepository } from './infrastructure/persistence/return.drizzle-repository';
import { RETURN_REPOSITORY } from './domain/ports/return.repository';

@Module({
  // Needs ORDER_REPOSITORY/INVOICE_REPOSITORY/LOT_REPOSITORY/PAYMENT_REPOSITORY
  // directly (not through their services) — see ReturnService's header comment,
  // same repository-to-repository composition as OrderService.placeOrder.
  imports: [SalesOrderModule, InvoicingTaxModule, PaymentReconcileModule, CatalogInventoryModule],
  controllers: [ReturnController],
  providers: [ReturnService, { provide: RETURN_REPOSITORY, useClass: ReturnDrizzleRepository }],
  exports: [ReturnService],
})
export class ReturnsModule {}
