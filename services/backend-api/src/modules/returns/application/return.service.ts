import { Inject, Injectable } from '@nestjs/common';
import { ConflictException, NotFoundException } from '@qnsc-vn/platform-http';
import { db } from '../../../db/client';
import { assertTenantMatchesSession, withTenantTransaction } from '../../../platform/tenant-context';
import { withIdempotency } from '../../../platform/idempotency';
import { compareMoney } from '../../../platform/money';
import { RETURN_REPOSITORY, type IReturnRepository } from '../domain/ports/return.repository';
import { ORDER_REPOSITORY, type IOrderRepository } from '../../sales-order/domain/ports/order.repository';
import { INVOICE_REPOSITORY, type IInvoiceRepository } from '../../invoicing-tax/domain/ports/invoice.repository';
import { LOT_REPOSITORY, type ILotRepository } from '../../catalog-inventory/domain/ports/lot.repository';
import { PAYMENT_REPOSITORY, type IPaymentRepository } from '../../payment-reconcile/domain/ports/payment.repository';
import type { Return, CreateReturnInput } from '../domain/return.types';

/**
 * `returnOrder` reverses a full, already-invoiced order across four
 * aggregates (Order, Invoice, Lot stock, Payment ledger) in ONE transaction
 * — same shape as `OrderService.placeOrder`/`InvoiceService.issueInvoice`:
 * `withTenantTransaction` + `withIdempotency` inside it, repository tokens
 * injected directly (not through their services) so every write shares this
 * one transaction. Full-order returns only — no partial-line returns, no
 * exchanges (see CLAUDE.md's "Returns" section for why).
 */
@Injectable()
export class ReturnService {
  constructor(
    @Inject(RETURN_REPOSITORY) private readonly returnRepository: IReturnRepository,
    @Inject(ORDER_REPOSITORY) private readonly orderRepository: IOrderRepository,
    @Inject(INVOICE_REPOSITORY) private readonly invoiceRepository: IInvoiceRepository,
    @Inject(LOT_REPOSITORY) private readonly lotRepository: ILotRepository,
    @Inject(PAYMENT_REPOSITORY) private readonly paymentRepository: IPaymentRepository,
  ) {}

  async returnOrder(tenantId: string, idempotencyKey: string, input: CreateReturnInput): Promise<Return> {
    assertTenantMatchesSession(tenantId);

    return withTenantTransaction(db, tenantId, (tx) =>
      withIdempotency(tx, tenantId, idempotencyKey, async () => {
        const order = await this.orderRepository.findById(input.orderId, tenantId);
        if (!order) {
          throw new NotFoundException('ORDER_NOT_FOUND', `Order ${input.orderId} not found`);
        }
        if (order.status !== 'confirmed') {
          throw new ConflictException('ORDER_NOT_RETURNABLE', `Order ${input.orderId} is ${order.status}, cannot be returned.`);
        }

        const invoice = await this.invoiceRepository.findByOrderId(input.orderId, tenantId);
        if (!invoice) {
          throw new ConflictException('NO_INVOICE_TO_RETURN', `Order ${input.orderId} has no invoice, nothing to reverse.`);
        }
        if (invoice.status === 'cancelled') {
          throw new ConflictException('NO_INVOICE_TO_RETURN', `Invoice ${invoice.id} is already cancelled.`);
        }

        // The guarded order flip is the RACE ARBITER, so it runs first: its
        // row lock serializes concurrent returns, the loser sees 0 rows and
        // throws before any stock credit or refund is written (and the
        // transaction rolls back regardless — effects below are atomic).
        const flipped = await this.orderRepository.markReturned(order.id, tenantId, tx);
        if (!flipped) {
          throw new ConflictException('ORDER_NOT_RETURNABLE', `Order ${order.id} is no longer confirmed (lost the return race or already returned).`);
        }
        const invoiceCancelled = await this.invoiceRepository.cancelForReturn(invoice.id, tenantId, tx);
        if (!invoiceCancelled) {
          throw new ConflictException('NO_INVOICE_TO_RETURN', `Invoice ${invoice.id} is no longer issued (lost the return race).`);
        }

        for (const line of order.lines) {
          await this.lotRepository.creditReturn(line.lotId, tenantId, line.quantity, order.id, tx);
        }

        const paidAmount = await this.paymentRepository.sumByInvoice(invoice.id, tenantId);
        let refundAmount = '0';
        if (compareMoney(paidAmount, '0') > 0) {
          if (!input.refundMethod) {
            throw new ConflictException('REFUND_METHOD_REQUIRED', `Invoice ${invoice.id} has ${paidAmount} paid — refundMethod is required to record the refund.`);
          }
          await this.paymentRepository.create(tenantId, { invoiceId: invoice.id, method: input.refundMethod, amount: paidAmount, type: 'refund' }, tx);
          refundAmount = paidAmount;
        }

        return this.returnRepository.create(
          tenantId,
          {
            orderId: order.id,
            invoiceId: invoice.id,
            reason: input.reason,
            refundAmount,
            ...(input.refundMethod !== undefined ? { refundMethod: input.refundMethod } : {}),
          },
          tx,
        );
      }),
    );
  }

  async getReturn(id: string, tenantId: string): Promise<Return> {
    assertTenantMatchesSession(tenantId);
    const found = await this.returnRepository.findById(id, tenantId);
    if (!found) {
      throw new NotFoundException('RETURN_NOT_FOUND', `Return ${id} not found`);
    }
    return found;
  }

  async listReturns(tenantId: string): Promise<Return[]> {
    assertTenantMatchesSession(tenantId);
    return this.returnRepository.listByTenant(tenantId);
  }
}
