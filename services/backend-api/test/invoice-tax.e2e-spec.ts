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
import type { TenantIndustry } from '../src/modules/identity-tenant/domain/tenant.types';

/**
 * Real Postgres, no mocks — issueInvoice's composition of order lookup, the
 * Strategy-pattern tax engine (Section 20.5), and the cumulative-annual
 * e-invoice threshold check (Section 5/20.4's concrete "1 tỷ VND/year" rule).
 */

const lotRepo = new LotDrizzleRepository();
const skuRepo = new SkuDrizzleRepository();
const orderRepo = new OrderDrizzleRepository();
const orderService = new OrderService(orderRepo, lotRepo, skuRepo);

const tenantService = new TenantService(new TenantDrizzleRepository(), new TenantMemberDrizzleRepository());
const taxCalculationService = new TaxCalculationService(new TaxRuleDrizzleRepository());
const invoiceRepo = new InvoiceDrizzleRepository();
const invoiceService = new InvoiceService(invoiceRepo, taxCalculationService, orderService, tenantService);

let keyCounter = 0;

async function placeOrderWithSubtotal(tenantId: string, industry: TenantIndustry, subtotal: string) {
  const sku = await withTenantTransaction(db, tenantId, async (tx) => {
    const rows = await tx
      .insert(skus)
      .values({ tenantId, skuCode: `SKU-TAX-${Date.now()}-${keyCounter}`, name: 'Tax test item', unit: 'cai', unitPrice: subtotal })
      .returning();
    return rows[0]!;
  });
  const lot = await lotRepo.receive(tenantId, { skuId: sku.id, lotCode: `LOT-TAX-${Date.now()}-${keyCounter}`, quantity: '1' });
  keyCounter += 1;
  return runWithTenant(tenantId, () =>
    orderService.placeOrder(tenantId, `tax-test-key-${Date.now()}-${keyCounter}`, {
      channel: 'counter',
      lines: [{ skuId: sku.id, lotId: lot.id, quantity: '1', unitPrice: subtotal }],
    }),
  );
}

async function seedTenant(legalName: string, industry: TenantIndustry) {
  const [tenant] = await db.insert(tenants).values({ legalName, industry }).returning();
  return tenant!.id;
}

describe('Invoice tax calculation (Strategy pattern, Section 20.5) — real Postgres, no mocks', () => {
  it('applies the tenant industry rate and computes tax/total correctly, below the e-invoice threshold', async () => {
    const tenantId = await seedTenant('Tax Test Tenant Agriculture', 'agriculture');
    const order = await placeOrderWithSubtotal(tenantId, 'agriculture', '1000000.00');

    const invoice = await runWithTenant(tenantId, () => invoiceService.issueInvoice(tenantId, order.id, `tax-test-invoice-key-${Date.now()}`));

    expect(invoice.taxRate).toBe('0.0150');
    expect(invoice.taxAmount).toBe('15000.00');
    expect(invoice.totalAmount).toBe('1015000.00');
    expect(invoice.requiresEInvoice).toBe(false);
    expect(invoice.invoiceNumber).toMatch(/^INV-\d{4}-\d{6}$/);
  });

  it('rejects a second invoice for the same order — a genuinely new request (different idempotency key), not a retry', async () => {
    const tenantId = await seedTenant('Tax Test Tenant Duplicate', 'food_beverage');
    const order = await placeOrderWithSubtotal(tenantId, 'food_beverage', '500000.00');

    await runWithTenant(tenantId, () => invoiceService.issueInvoice(tenantId, order.id, `tax-test-invoice-key-a-${Date.now()}`));

    await expect(runWithTenant(tenantId, () => invoiceService.issueInvoice(tenantId, order.id, `tax-test-invoice-key-b-${Date.now()}`))).rejects.toThrow();
  });

  it('a retry with the SAME idempotency key replays the cached invoice instead of erroring — Section 11\'s "idempotent invoice issuance when connectivity drops mid-transaction"', async () => {
    const tenantId = await seedTenant('Tax Test Tenant Idempotent Retry', 'food_beverage');
    const order = await placeOrderWithSubtotal(tenantId, 'food_beverage', '700000.00');
    const key = `tax-test-invoice-retry-key-${Date.now()}`;

    const first = await runWithTenant(tenantId, () => invoiceService.issueInvoice(tenantId, order.id, key));
    const retried = await runWithTenant(tenantId, () => invoiceService.issueInvoice(tenantId, order.id, key));

    expect(retried.id).toBe(first.id);
    expect(retried.invoiceNumber).toBe(first.invoiceNumber);
    expect(retried.issuedAt).toBeInstanceOf(Date);
    expect(retried.issuedAt.getTime()).toBe(first.issuedAt.getTime());

    // Confirms the retry didn't ALSO insert a second row under the hood —
    // the real regression this fix closes, not just "no error thrown".
    const all = await invoiceRepo.listByTenant(tenantId);
    expect(all.filter((i) => i.orderId === order.id)).toHaveLength(1);
  });

  it('a single order at/above the annual threshold requires an e-invoice', async () => {
    const tenantId = await seedTenant('Tax Test Tenant Big Order', 'tourism');
    const order = await placeOrderWithSubtotal(tenantId, 'tourism', '1000000000.00'); // exactly the 1 tỷ threshold

    const invoice = await runWithTenant(tenantId, () => invoiceService.issueInvoice(tenantId, order.id, `tax-test-invoice-key-${Date.now()}`));

    expect(invoice.requiresEInvoice).toBe(true);
  });

  it('cumulative revenue across multiple invoices this year crosses the threshold, flipping requiresEInvoice on the invoice that tips it over', async () => {
    const tenantId = await seedTenant('Tax Test Tenant Cumulative', 'food_beverage');

    const orderA = await placeOrderWithSubtotal(tenantId, 'food_beverage', '600000000.00');
    const invoiceA = await runWithTenant(tenantId, () => invoiceService.issueInvoice(tenantId, orderA.id, `tax-test-invoice-key-a-${Date.now()}`));
    expect(invoiceA.requiresEInvoice).toBe(false); // 600M < 1B

    const orderB = await placeOrderWithSubtotal(tenantId, 'food_beverage', '500000000.00');
    const invoiceB = await runWithTenant(tenantId, () => invoiceService.issueInvoice(tenantId, orderB.id, `tax-test-invoice-key-b-${Date.now()}`));
    expect(invoiceB.requiresEInvoice).toBe(true); // 600M + 500M = 1.1B >= 1B
  });
});
