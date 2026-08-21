import { Inject, Injectable } from '@nestjs/common';
import { ConflictException, NotFoundException } from '@qnsc-vn/platform-http';
import { db } from '../../../db/client';
import { assertTenantMatchesSession, withTenantTransaction } from '../../../platform/tenant-context';
import { withIdempotency } from '../../../platform/idempotency';
import { yearWindowUtc, currentQuarterOf } from '../../../platform/vn-time';
import { addMoney, compareMoney } from '../../../platform/money';
import { INVOICE_REPOSITORY, type IInvoiceRepository } from '../domain/ports/invoice.repository';
import { TaxCalculationService } from './tax-calculation.service';
import { OrderService } from '../../sales-order/application/order.service';
import { TenantService } from '../../identity-tenant/application/tenant.service';
import { TENANT_MEMBER_REPOSITORY, type ITenantMemberRepository } from '../../identity-tenant/domain/ports/tenant.repository';
import { NotificationService } from '../../notifications/application/notification.service';
import type { Invoice } from '../domain/invoice.types';

/**
 * `issueInvoice` composes: order lookup (must be `confirmed`) -> tax
 * calculation (Strategy, per tenant industry) -> cumulative-this-year
 * revenue check (the concrete e-invoice threshold, Section 5/20.4) ->
 * atomic invoice-number assignment + insert, all inside one
 * `withTenantTransaction` + `withIdempotency` (Mục 5.2) — same shape as
 * `OrderService.placeOrder`. A dropped connection mid-issuance and a
 * client retry with the SAME `Idempotency-Key` now transparently replays
 * the cached response instead of throwing `INVOICE_ALREADY_ISSUED` — that
 * conflict check stays as defense-in-depth for a genuinely NEW request
 * that names an order which already has a (possibly different-key)
 * invoice, not the idempotent-retry path, which never reaches it (the key
 * lookup short-circuits first). `UNIQUE (tenant_id, order_id)` is still
 * the DB-level backstop under both paths.
 */
@Injectable()
export class InvoiceService {
  constructor(
    @Inject(INVOICE_REPOSITORY) private readonly invoiceRepository: IInvoiceRepository,
    @Inject(TENANT_MEMBER_REPOSITORY) private readonly memberRepository: ITenantMemberRepository,
    private readonly taxCalculationService: TaxCalculationService,
    private readonly orderService: OrderService,
    private readonly tenantService: TenantService,
    private readonly notificationService: NotificationService,
  ) {}

  async issueInvoice(tenantId: string, orderId: string, idempotencyKey: string): Promise<Invoice> {
    assertTenantMatchesSession(tenantId);

    return withTenantTransaction(db, tenantId, (tx) =>
      withIdempotency(tx, tenantId, idempotencyKey, async () => {
        const existing = await this.invoiceRepository.findByOrderId(orderId, tenantId);
        if (existing) {
          throw new ConflictException('INVOICE_ALREADY_ISSUED', `Order ${orderId} already has invoice ${existing.invoiceNumber}.`);
        }

        const order = await this.orderService.getOrder(orderId, tenantId);
        if (order.status !== 'confirmed') {
          throw new ConflictException('ORDER_NOT_CONFIRMED', `Order ${orderId} is ${order.status}, cannot issue an invoice.`);
        }

        const tenant = await this.tenantService.getTenant(tenantId);
        const asOf = new Date();
        const { taxRule, taxAmount, totalAmount } = await this.taxCalculationService.calculate(tenant.industry, order.totalAmount, asOf);

        // VN-local year window — the SAME definition tax-filing's exemption
        // gate uses. A UTC boundary here let an order at 23:30 UTC Dec 31 land
        // in a different "cumulative year" than the exemption check.
        const yearStart = yearWindowUtc(currentQuarterOf(asOf).year).start;
        const cumulativeBefore = await this.invoiceRepository.sumIssuedSubtotalSince(tenantId, yearStart);
        const projectedCumulative = addMoney(cumulativeBefore, order.totalAmount);
        const requiresEInvoice = compareMoney(projectedCumulative, taxRule.annualRevenueThreshold) >= 0;
        // The exact one-time crossing, not "requiresEInvoice is true" in
        // general — every subsequent invoice this year stays true too, but
        // re-notifying on each one would be spammy. Only the invoice whose
        // cumulative-before was still under the threshold fires this.
        const justCrossed = requiresEInvoice && compareMoney(cumulativeBefore, taxRule.annualRevenueThreshold) < 0;

        const invoice = await this.invoiceRepository.create(
          tenantId,
          {
            orderId,
            taxRuleId: taxRule.id,
            subtotal: order.totalAmount,
            taxRate: taxRule.rate,
            taxAmount,
            totalAmount,
            requiresEInvoice,
          },
          tx,
        );

        if (justCrossed) {
          const owners = await this.memberRepository.listOwners(tenantId);
          for (const owner of owners) {
            await this.notificationService.notify(
              tenantId,
              {
                userId: owner.userId,
                type: 'EINVOICE_THRESHOLD_CROSSED',
                title: 'Cần phát hành hóa đơn điện tử',
                body: `Doanh thu lũy kế năm nay của ${tenant.legalName} đã vượt ngưỡng yêu cầu hóa đơn điện tử.`,
                sourceEventId: `einvoice-threshold-${tenantId}-${asOf.getUTCFullYear()}`,
                email: { templateName: 'EINVOICE_THRESHOLD_CROSSED', vars: { tenantName: tenant.legalName } },
              },
              tx,
            );
          }
        }

        return invoice;
      }),
    );
  }

  async getInvoice(id: string, tenantId: string): Promise<Invoice> {
    assertTenantMatchesSession(tenantId);
    const invoice = await this.invoiceRepository.findById(id, tenantId);
    if (!invoice) {
      throw new NotFoundException('INVOICE_NOT_FOUND', `Invoice ${id} not found`);
    }
    return invoice;
  }

  async listInvoices(tenantId: string): Promise<Invoice[]> {
    assertTenantMatchesSession(tenantId);
    return this.invoiceRepository.listByTenant(tenantId);
  }

  /** Human-readable lookup — the form a bank-transfer content/QR note carries. Used by connector-hub's forwarded-payment path (see `payment-reconcile`'s internal controller). */
  async getInvoiceByNumber(tenantId: string, invoiceNumber: string): Promise<Invoice> {
    assertTenantMatchesSession(tenantId);
    const invoice = await this.invoiceRepository.findByInvoiceNumber(invoiceNumber, tenantId);
    if (!invoice) {
      throw new NotFoundException('INVOICE_NOT_FOUND', `Invoice "${invoiceNumber}" not found`);
    }
    return invoice;
  }
}
