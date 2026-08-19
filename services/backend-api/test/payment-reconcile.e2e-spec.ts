import { describe, it, expect } from 'vitest';
import { db } from '../src/db/client';
import { tenants } from '../src/db/schema/tenants';
import { skus } from '../src/db/schema/skus';
import { withTenantTransaction, runWithTenant } from '../src/platform/tenant-context';
import { LotDrizzleRepository } from '../src/modules/catalog-inventory/infrastructure/persistence/lot.drizzle-repository';
import { SkuDrizzleRepository } from '../src/modules/catalog-inventory/infrastructure/persistence/sku.drizzle-repository';
import { OrderDrizzleRepository } from '../src/modules/sales-order/infrastructure/persistence/order.drizzle-repository';
import { OrderService } from '../src/modules/sales-order/application/order.service';
import { TenantDrizzleRepository } from '../src/modules/identity-tenant/infrastructure/persistence/tenant.drizzle-repository';
import { TenantMemberDrizzleRepository } from '../src/modules/identity-tenant/infrastructure/persistence/tenant-member.drizzle-repository';
import { TenantService } from '../src/modules/identity-tenant/application/tenant.service';
import { TaxRuleDrizzleRepository } from '../src/modules/invoicing-tax/infrastructure/persistence/tax-rule.drizzle-repository';
import { InvoiceDrizzleRepository } from '../src/modules/invoicing-tax/infrastructure/persistence/invoice.drizzle-repository';
import { TaxCalculationService } from '../src/modules/invoicing-tax/application/tax-calculation.service';
import { InvoiceService } from '../src/modules/invoicing-tax/application/invoice.service';
import { PaymentDrizzleRepository } from '../src/modules/payment-reconcile/infrastructure/persistence/payment.drizzle-repository';
import { PaymentService } from '../src/modules/payment-reconcile/application/payment.service';

/**
 * Real Postgres, no mocks — payment recording, the reference-code dedup
 * guard (docs Section 7), overpayment rejection, and the derived (never
 * stored) payment summary.
 */

const lotRepo = new LotDrizzleRepository();
const skuRepo = new SkuDrizzleRepository();
const orderRepo = new OrderDrizzleRepository();
const orderService = new OrderService(orderRepo, lotRepo, skuRepo);

const tenantService = new TenantService(new TenantDrizzleRepository(), new TenantMemberDrizzleRepository());
const taxCalculationService = new TaxCalculationService(new TaxRuleDrizzleRepository());
const invoiceRepo = new InvoiceDrizzleRepository();
const invoiceService = new InvoiceService(invoiceRepo, taxCalculationService, orderService, tenantService);

const paymentRepo = new PaymentDrizzleRepository();
const paymentService = new PaymentService(paymentRepo, invoiceService);

let counter = 0;

async function seedInvoice(legalName: string, subtotal: string) {
  const [tenant] = await db.insert(tenants).values({ legalName, industry: 'food_beverage' }).returning();
  const tenantId = tenant!.id;
  counter += 1;

  const sku = await withTenantTransaction(db, tenantId, async (tx) => {
    const rows = await tx
      .insert(skus)
      .values({ tenantId, skuCode: `SKU-PAY-${Date.now()}-${counter}`, name: 'Payment test item', unit: 'cai', unitPrice: subtotal })
      .returning();
    return rows[0]!;
  });
  const lot = await lotRepo.receive(tenantId, { skuId: sku.id, lotCode: `LOT-PAY-${Date.now()}-${counter}` , quantity: '1' });
  const order = await runWithTenant(tenantId, () =>
    orderService.placeOrder(tenantId, `pay-test-key-${Date.now()}-${counter}`, {
      channel: 'counter',
      lines: [{ skuId: sku.id, lotId: lot.id, quantity: '1', unitPrice: subtotal }],
    }),
  );
  const invoice = await runWithTenant(tenantId, () => invoiceService.issueInvoice(tenantId, order.id, `pay-test-invoice-key-${Date.now()}-${counter}`));
  return { tenantId, invoice };
}

describe('Payment reconciliation — real Postgres, no mocks', () => {
  it('recording a payment less than the invoice total leaves it partially paid', async () => {
    const { tenantId, invoice } = await seedInvoice('Payment Test Tenant Partial', '100000.00'); // total 104500 at 4.5% VAT

    const payment = await runWithTenant(tenantId, () =>
      paymentService.recordPayment(tenantId, { invoiceId: invoice.id, method: 'cash', amount: '50000.00' }),
    );
    expect(payment.amount).toBe('50000.00');

    const summary = await runWithTenant(tenantId, () => paymentService.getPaymentSummary(invoice.id, tenantId));
    expect(summary.paidAmount).toBe('50000.00');
    expect(summary.outstandingAmount).toBe((Number(invoice.totalAmount) - 50000).toFixed(2));
    expect(summary.isFullyPaid).toBe(false);
  });

  it('recording payments up to the exact invoice total marks it fully paid', async () => {
    const { tenantId, invoice } = await seedInvoice('Payment Test Tenant Full', '100000.00');

    await runWithTenant(tenantId, () => paymentService.recordPayment(tenantId, { invoiceId: invoice.id, method: 'bank_transfer', amount: invoice.totalAmount, referenceCode: 'TXN-FULL-1' }));

    const summary = await runWithTenant(tenantId, () => paymentService.getPaymentSummary(invoice.id, tenantId));
    expect(summary.outstandingAmount).toBe('0.00');
    expect(summary.isFullyPaid).toBe(true);
  });

  it('rejects a payment that would overpay the invoice', async () => {
    const { tenantId, invoice } = await seedInvoice('Payment Test Tenant Overpay', '100000.00');

    await expect(
      runWithTenant(tenantId, () =>
        paymentService.recordPayment(tenantId, { invoiceId: invoice.id, method: 'cash', amount: (Number(invoice.totalAmount) + 1).toFixed(2) }),
      ),
    ).rejects.toThrow();
  });

  it('rejects a second payment reusing the same reference code (dedup, docs Section 7)', async () => {
    const { tenantId, invoice } = await seedInvoice('Payment Test Tenant Dedup', '200000.00');

    await runWithTenant(tenantId, () =>
      paymentService.recordPayment(tenantId, { invoiceId: invoice.id, method: 'qr', amount: '50000.00', referenceCode: 'QR-DEDUP-1' }),
    );

    await expect(
      runWithTenant(tenantId, () =>
        paymentService.recordPayment(tenantId, { invoiceId: invoice.id, method: 'qr', amount: '30000.00', referenceCode: 'QR-DEDUP-1' }),
      ),
    ).rejects.toThrow();

    const summary = await runWithTenant(tenantId, () => paymentService.getPaymentSummary(invoice.id, tenantId));
    expect(summary.paidAmount).toBe('50000.00'); // second attempt never recorded
  });
});
