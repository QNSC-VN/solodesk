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
import { NotificationService } from '../src/modules/notifications/application/notification.service';
import { PaymentDrizzleRepository } from '../src/modules/payment-reconcile/infrastructure/persistence/payment.drizzle-repository';
import { PaymentService } from '../src/modules/payment-reconcile/application/payment.service';
import { ReturnDrizzleRepository } from '../src/modules/returns/infrastructure/persistence/return.drizzle-repository';
import { ReturnService } from '../src/modules/returns/application/return.service';

/**
 * Real Postgres, no mocks — full-order reversal spanning order + invoice +
 * payment + stock (CLAUDE.md's "Returns" section).
 */

const lotRepo = new LotDrizzleRepository();
const skuRepo = new SkuDrizzleRepository();
const orderRepo = new OrderDrizzleRepository();
const orderService = new OrderService(orderRepo, lotRepo, skuRepo);

const tenantService = new TenantService(new TenantDrizzleRepository(), new TenantMemberDrizzleRepository());
const taxCalculationService = new TaxCalculationService(new TaxRuleDrizzleRepository());
const invoiceRepo = new InvoiceDrizzleRepository();
const invoiceService = new InvoiceService(invoiceRepo, new TenantMemberDrizzleRepository(), taxCalculationService, orderService, tenantService, new NotificationService());

const paymentRepo = new PaymentDrizzleRepository();
const paymentService = new PaymentService(paymentRepo, invoiceService);

const returnRepo = new ReturnDrizzleRepository();
const returnService = new ReturnService(returnRepo, orderRepo, invoiceRepo, lotRepo, paymentRepo);

let counter = 0;

async function seedInvoicedOrder(legalName: string, unitPrice: string, quantity = '1') {
  const [tenant] = await db.insert(tenants).values({ legalName, industry: 'food_beverage' }).returning();
  const tenantId = tenant!.id;
  counter += 1;

  const sku = await withTenantTransaction(db, tenantId, async (tx) => {
    const rows = await tx
      .insert(skus)
      .values({ tenantId, skuCode: `SKU-RET-${Date.now()}-${counter}`, name: 'Return test item', unit: 'cai', unitPrice })
      .returning();
    return rows[0]!;
  });
  const lot = await lotRepo.receive(tenantId, { skuId: sku.id, lotCode: `LOT-RET-${Date.now()}-${counter}`, quantity: '10' });
  const order = await runWithTenant(tenantId, () =>
    orderService.placeOrder(tenantId, `ret-test-order-key-${Date.now()}-${counter}`, {
      channel: 'counter',
      lines: [{ skuId: sku.id, lotId: lot.id, quantity, unitPrice }],
    }),
  );
  const invoice = await runWithTenant(tenantId, () => invoiceService.issueInvoice(tenantId, order.id, `ret-test-invoice-key-${Date.now()}-${counter}`));
  return { tenantId, skuId: sku.id, lotId: lot.id, order, invoice };
}

describe('Returns — full-order reversal (order + invoice + payment + stock) — real Postgres, no mocks', () => {
  it('two CONCURRENT returns with different idempotency keys: exactly one wins, no double refund, no double stock credit', async () => {
    const { tenantId, skuId, order, invoice } = await seedInvoicedOrder('Return Test Tenant Race', '50000.00');
    await runWithTenant(tenantId, () => paymentService.recordPayment(tenantId, { invoiceId: invoice.id, method: 'cash', amount: invoice.totalAmount }));

    const stamp = Date.now();
    const results = await Promise.allSettled([
      runWithTenant(tenantId, () => returnService.returnOrder(tenantId, `race-a-${stamp}`, { orderId: order.id, reason: 'race a', refundMethod: 'cash' })),
      runWithTenant(tenantId, () => returnService.returnOrder(tenantId, `race-b-${stamp}`, { orderId: order.id, reason: 'race b', refundMethod: 'cash' })),
    ]);
    const winners = results.filter((r) => r.status === 'fulfilled');
    expect(winners).toHaveLength(1);

    // Stock credited EXACTLY once (10 received - 1 sold + 1 credit = 10), one
    // refund row, one return row — the pre-fix bug double-credited all three.
    expect((await lotRepo.getAvailableQuantity(skuId, tenantId)).totalAvailable).toBe('10.000');
    const returns = await returnRepo.listByTenant(tenantId);
    expect(returns).toHaveLength(1);
    const refunds = await paymentRepo.listByInvoice(invoice.id, tenantId);
    expect(refunds.filter((p) => p.type === 'refund')).toHaveLength(1);
  });

  it('a return on a paid, fully-invoiced order credits stock back, cancels the invoice, and refunds the paid amount', async () => {
    const { tenantId, skuId, order, invoice } = await seedInvoicedOrder('Return Test Tenant Full', '100000.00');
    await runWithTenant(tenantId, () => paymentService.recordPayment(tenantId, { invoiceId: invoice.id, method: 'cash', amount: invoice.totalAmount }));

    const before = await lotRepo.getAvailableQuantity(skuId, tenantId); // 10 received - 1 sold = 9

    const result = await runWithTenant(tenantId, () =>
      returnService.returnOrder(tenantId, `ret-test-key-${Date.now()}`, { orderId: order.id, reason: 'Khách trả hàng', refundMethod: 'cash' }),
    );

    expect(result.refundAmount).toBe(invoice.totalAmount);
    expect(result.refundMethod).toBe('cash');
    expect(result.status).toBe('completed');

    const updatedOrder = await orderRepo.findById(order.id, tenantId);
    expect(updatedOrder!.status).toBe('returned');
    const updatedInvoice = await invoiceRepo.findById(invoice.id, tenantId);
    expect(updatedInvoice!.status).toBe('cancelled');

    const after = await lotRepo.getAvailableQuantity(skuId, tenantId);
    expect(Number(after.totalOnHand)).toBe(Number(before.totalOnHand) + 1); // back to 10

    // Net paid amount is 0 after the refund — this is exactly what the
    // `payments.type` design was for: without it, paidAmount would still
    // read the ORIGINAL amount, making isFullyPaid true, which is the
    // factually-wrong state CLAUDE.md's "Returns" section calls out. With
    // the fix, paidAmount correctly nets to 0 and isFullyPaid is false
    // (0 paid < totalAmount) — a returned invoice's summary is honest about
    // there being no payment on record, not a false "fully paid".
    const summary = await runWithTenant(tenantId, () => paymentService.getPaymentSummary(invoice.id, tenantId));
    expect(summary.paidAmount).toBe('0.00'); // real numeric SUM over 2 rows (payment + refund), properly scaled — not the no-rows COALESCE fallback
    expect(summary.outstandingAmount).toBe(invoice.totalAmount);
    expect(summary.isFullyPaid).toBe(false);
  });

  it('a return on an order with no payments yet refunds 0 and records no refund payment row', async () => {
    const { tenantId, order, invoice } = await seedInvoicedOrder('Return Test Tenant Unpaid', '50000.00');

    const result = await runWithTenant(tenantId, () =>
      returnService.returnOrder(tenantId, `ret-test-key-unpaid-${Date.now()}`, { orderId: order.id, reason: 'Đổi ý' }),
    );

    expect(result.refundAmount).toBe('0.00'); // numeric(14,2) column formats the stored '0' back out with scale
    expect(result.refundMethod).toBeNull();

    const payments = await paymentRepo.listByInvoice(invoice.id, tenantId);
    expect(payments).toHaveLength(0);
  });

  it('a return that owes money back but omits refundMethod is rejected', async () => {
    const { tenantId, order, invoice } = await seedInvoicedOrder('Return Test Tenant Missing Method', '80000.00');
    await runWithTenant(tenantId, () => paymentService.recordPayment(tenantId, { invoiceId: invoice.id, method: 'cash', amount: invoice.totalAmount }));

    await expect(
      runWithTenant(tenantId, () => returnService.returnOrder(tenantId, `ret-test-key-missing-${Date.now()}`, { orderId: order.id, reason: 'Thiếu phương thức hoàn tiền' })),
    ).rejects.toThrow();
  });

  it('returning an already-returned order is rejected', async () => {
    const { tenantId, order } = await seedInvoicedOrder('Return Test Tenant Already Returned', '60000.00');
    await runWithTenant(tenantId, () => returnService.returnOrder(tenantId, `ret-test-key-first-${Date.now()}`, { orderId: order.id, reason: 'first return' }));

    await expect(
      runWithTenant(tenantId, () => returnService.returnOrder(tenantId, `ret-test-key-second-${Date.now()}`, { orderId: order.id, reason: 'second attempt' })),
    ).rejects.toThrow();
  });

  it('returning an order with no invoice yet is rejected', async () => {
    const [tenant] = await db.insert(tenants).values({ legalName: 'Return Test Tenant No Invoice', industry: 'food_beverage' }).returning();
    const tenantId = tenant!.id;
    counter += 1;
    const sku = await withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx.insert(skus).values({ tenantId, skuCode: `SKU-RET-NOINV-${Date.now()}-${counter}`, name: 'No invoice item', unit: 'cai', unitPrice: '10000.00' }).returning();
      return rows[0]!;
    });
    const lot = await lotRepo.receive(tenantId, { skuId: sku.id, lotCode: `LOT-RET-NOINV-${Date.now()}-${counter}`, quantity: '5' });
    const order = await runWithTenant(tenantId, () =>
      orderService.placeOrder(tenantId, `ret-test-noinv-key-${Date.now()}-${counter}`, {
        channel: 'counter',
        lines: [{ skuId: sku.id, lotId: lot.id, quantity: '1', unitPrice: '10000.00' }],
      }),
    );

    await expect(
      runWithTenant(tenantId, () => returnService.returnOrder(tenantId, `ret-test-key-noinv-${Date.now()}`, { orderId: order.id, reason: 'no invoice yet' })),
    ).rejects.toThrow();
  });

  it('a retry with the SAME idempotency key replays the cached return instead of erroring or double-crediting stock', async () => {
    const { tenantId, order, invoice } = await seedInvoicedOrder('Return Test Tenant Idempotent', '40000.00');
    await runWithTenant(tenantId, () => paymentService.recordPayment(tenantId, { invoiceId: invoice.id, method: 'cash', amount: invoice.totalAmount }));
    const key = `ret-test-idempotent-key-${Date.now()}`;

    const first = await runWithTenant(tenantId, () => returnService.returnOrder(tenantId, key, { orderId: order.id, reason: 'retry test', refundMethod: 'cash' }));
    const retried = await runWithTenant(tenantId, () => returnService.returnOrder(tenantId, key, { orderId: order.id, reason: 'retry test', refundMethod: 'cash' }));

    expect(retried.id).toBe(first.id);

    const all = await returnRepo.listByTenant(tenantId);
    expect(all.filter((r) => r.orderId === order.id)).toHaveLength(1);

    const skuId = (await orderRepo.findById(order.id, tenantId))!.lines[0]!.skuId;
    const available = await lotRepo.getAvailableQuantity(skuId, tenantId);
    expect(Number(available.totalOnHand)).toBe(10); // credited exactly once, not twice
  });

  it('a genuinely new request with a different idempotency key on an already-returned order is still correctly rejected', async () => {
    const { tenantId, order } = await seedInvoicedOrder('Return Test Tenant New Key Rejected', '70000.00');
    await runWithTenant(tenantId, () => returnService.returnOrder(tenantId, `ret-test-diffkey-a-${Date.now()}`, { orderId: order.id, reason: 'first' }));

    await expect(
      runWithTenant(tenantId, () => returnService.returnOrder(tenantId, `ret-test-diffkey-b-${Date.now()}`, { orderId: order.id, reason: 'second, different key' })),
    ).rejects.toThrow();
  });
});
