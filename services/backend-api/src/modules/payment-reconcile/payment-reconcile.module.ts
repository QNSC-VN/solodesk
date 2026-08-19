import { Module } from '@nestjs/common';
import { InvoicingTaxModule } from '../invoicing-tax/invoicing-tax.module';
import { PaymentService } from './application/payment.service';
import { PaymentController } from './api/payment.controller';
import { PaymentDrizzleRepository } from './infrastructure/persistence/payment.drizzle-repository';
import { PAYMENT_REPOSITORY } from './domain/ports/payment.repository';

@Module({
  imports: [InvoicingTaxModule], // needs InvoiceService for invoice lookup/total — see PaymentService
  controllers: [PaymentController],
  providers: [PaymentService, { provide: PAYMENT_REPOSITORY, useClass: PaymentDrizzleRepository }],
  exports: [PaymentService],
})
export class PaymentReconcileModule {}
