import { Inject, Injectable } from '@nestjs/common';
import { ConflictException } from '@qnsc-vn/platform-http';
import { assertTenantMatchesSession } from '../../../platform/tenant-context';
import { PAYMENT_REPOSITORY, type IPaymentRepository } from '../domain/ports/payment.repository';
import { InvoiceService } from '../../invoicing-tax/application/invoice.service';
import type { Payment, CreatePaymentInput, PaymentSummary } from '../domain/payment.types';

/**
 * `recordPayment` reconciles against `InvoiceService`, not `tax.invoices`
 * directly — same module-boundary discipline as `InvoiceService` calling
 * `OrderService` instead of reading `sales.orders` itself. "Reconciled"
 * here means derived, not stored: `getPaymentSummary` sums `payments` and
 * compares to `invoice.totalAmount` on every call rather than persisting an
 * `isFullyPaid`/status column that could drift out of sync with the
 * payments it's supposed to summarize (Section 20.5's CQRS-lite: a read
 * query is the simplest thing that's actually correct here).
 */
@Injectable()
export class PaymentService {
  constructor(
    @Inject(PAYMENT_REPOSITORY) private readonly paymentRepository: IPaymentRepository,
    private readonly invoiceService: InvoiceService,
  ) {}

  async recordPayment(tenantId: string, input: CreatePaymentInput): Promise<Payment> {
    assertTenantMatchesSession(tenantId);

    const invoice = await this.invoiceService.getInvoice(input.invoiceId, tenantId);
    if (invoice.status === 'cancelled') {
      throw new ConflictException('INVOICE_CANCELLED', `Invoice ${input.invoiceId} is cancelled, cannot record a payment against it.`);
    }

    if (input.referenceCode) {
      const duplicate = await this.paymentRepository.findByReferenceCode(tenantId, input.referenceCode);
      if (duplicate) {
        throw new ConflictException('DUPLICATE_PAYMENT_REFERENCE', `A payment with reference code "${input.referenceCode}" was already recorded.`);
      }
    }

    const paidSoFar = await this.paymentRepository.sumByInvoice(input.invoiceId, tenantId);
    const projected = Number(paidSoFar) + Number(input.amount);
    if (projected > Number(invoice.totalAmount)) {
      throw new ConflictException(
        'OVERPAYMENT',
        `Payment of ${input.amount} would bring invoice ${input.invoiceId} to ${projected.toFixed(2)}, exceeding its total ${invoice.totalAmount}.`,
      );
    }

    return this.paymentRepository.create(tenantId, input);
  }

  async listPayments(invoiceId: string, tenantId: string): Promise<Payment[]> {
    assertTenantMatchesSession(tenantId);
    await this.invoiceService.getInvoice(invoiceId, tenantId); // 404s if missing/cross-tenant
    return this.paymentRepository.listByInvoice(invoiceId, tenantId);
  }

  async getPaymentSummary(invoiceId: string, tenantId: string): Promise<PaymentSummary> {
    assertTenantMatchesSession(tenantId);
    const invoice = await this.invoiceService.getInvoice(invoiceId, tenantId);
    const paidAmount = await this.paymentRepository.sumByInvoice(invoiceId, tenantId);
    const outstandingAmount = (Number(invoice.totalAmount) - Number(paidAmount)).toFixed(2);

    return {
      invoiceId,
      totalAmount: invoice.totalAmount,
      paidAmount,
      outstandingAmount,
      isFullyPaid: Number(outstandingAmount) <= 0,
    };
  }
}
