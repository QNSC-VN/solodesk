import { Inject, Injectable } from '@nestjs/common';
import { ConflictException, NotFoundException } from '@qnsc-vn/platform-http';
import { assertTenantMatchesSession } from '../../../platform/tenant-context';
import { addMoney, compareMoney } from '../../../platform/money';
import { INVOICE_REPOSITORY, type IInvoiceRepository } from '../domain/ports/invoice.repository';
import { TaxCalculationService } from './tax-calculation.service';
import { OrderService } from '../../sales-order/application/order.service';
import { TenantService } from '../../identity-tenant/application/tenant.service';
import type { Invoice } from '../domain/invoice.types';

/**
 * `issueInvoice` composes: order lookup (must be `confirmed`) -> tax
 * calculation (Strategy, per tenant industry) -> cumulative-this-year
 * revenue check (the concrete e-invoice threshold, Section 5/20.4) ->
 * atomic invoice-number assignment + insert. One invoice per order — a
 * second attempt for the same order returns a conflict, not a duplicate
 * (`UNIQUE (tenant_id, order_id)` is the DB-level backstop; the check here
 * is the fast, friendly path, same convention as `CatalogService.createSku`).
 */
@Injectable()
export class InvoiceService {
  constructor(
    @Inject(INVOICE_REPOSITORY) private readonly invoiceRepository: IInvoiceRepository,
    private readonly taxCalculationService: TaxCalculationService,
    private readonly orderService: OrderService,
    private readonly tenantService: TenantService,
  ) {}

  async issueInvoice(tenantId: string, orderId: string): Promise<Invoice> {
    assertTenantMatchesSession(tenantId);

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

    const yearStart = new Date(Date.UTC(asOf.getUTCFullYear(), 0, 1));
    const cumulativeBefore = await this.invoiceRepository.sumIssuedSubtotalSince(tenantId, yearStart);
    const projectedCumulative = addMoney(cumulativeBefore, order.totalAmount);
    const requiresEInvoice = compareMoney(projectedCumulative, taxRule.annualRevenueThreshold) >= 0;

    return this.invoiceRepository.create(tenantId, {
      orderId,
      taxRuleId: taxRule.id,
      subtotal: order.totalAmount,
      taxRate: taxRule.rate,
      taxAmount,
      totalAmount,
      requiresEInvoice,
    });
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
