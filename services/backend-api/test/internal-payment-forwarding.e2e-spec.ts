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
 * Real Postgres, no mocks — the invoice-number lookup and
 * recordPaymentByInvoiceNumber path connector-hub's SePay webhook
 * forwarding uses (see InternalPaymentController). The HTTP-level
 * InternalServiceGuard itself is verified against a live dev server (no
 * supertest-style harness in this repo's e2e convention), not here.
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
      .values({ tenantId, skuCode: `SKU-FWD-${Date.now()}-${counter}`, name: 'Forwarding test item', unit: 'cai', unitPrice: subtotal })
      .returning();
    return rows[0]!;
  });
  const lot = await lotRepo.receive(tenantId, { skuId: sku.id, lotCode: `LOT-FWD-${Date.now()}-${counter}`, quantity: '1' });
  const order = await runWithTenant(tenantId, () =>
    orderService.placeOrder(tenantId, `fwd-test-key-${Date.now()}-${counter}`, { channel: 'counter', lines: [{ skuId: sku.id, lotId: lot.id, quantity: '1', unitPrice: subtotal }] }),
  );
  const invoice = await runWithTenant(tenantId, () => invoiceService.issueInvoice(tenantId, order.id, `fwd-test-invoice-key-${Date.now()}-${counter}`));
  return { tenantId, invoice };
}

describe('Payment forwarding by invoice number — real Postgres, no mocks', () => {
  it('recordPaymentByInvoiceNumber resolves the invoice by its human-readable number and records the payment', async () => {
    const { tenantId, invoice } = await seedInvoice('Forwarding Tenant Basic', '100000.00');

    const payment = await runWithTenant(tenantId, () =>
      paymentService.recordPaymentByInvoiceNumber(tenantId, invoice.invoiceNumber, { method: 'bank_transfer', amount: invoice.totalAmount, referenceCode: 'SEPAY-TXN-1' }),
    );

    expect(payment.invoiceId).toBe(invoice.id);
    expect(payment.amount).toBe(invoice.totalAmount);

    const summary = await runWithTenant(tenantId, () => paymentService.getPaymentSummary(invoice.id, tenantId));
    expect(summary.isFullyPaid).toBe(true);
  });

  it('an unknown invoice number 404s, same as an unknown invoice id would', async () => {
    const { tenantId } = await seedInvoice('Forwarding Tenant Unknown', '50000.00');

    await expect(
      runWithTenant(tenantId, () => paymentService.recordPaymentByInvoiceNumber(tenantId, 'INV-2026-999999', { method: 'bank_transfer', amount: '1.00' })),
    ).rejects.toThrow();
  });

  it('a retried forward attempt with the SAME referenceCode is rejected, not double-recorded — composes with the existing dedup guard', async () => {
    const { tenantId, invoice } = await seedInvoice('Forwarding Tenant Retry', '80000.00');

    await runWithTenant(tenantId, () =>
      paymentService.recordPaymentByInvoiceNumber(tenantId, invoice.invoiceNumber, { method: 'bank_transfer', amount: '30000.00', referenceCode: 'SEPAY-TXN-RETRY-1' }),
    );

    await expect(
      runWithTenant(tenantId, () =>
        paymentService.recordPaymentByInvoiceNumber(tenantId, invoice.invoiceNumber, { method: 'bank_transfer', amount: '30000.00', referenceCode: 'SEPAY-TXN-RETRY-1' }),
      ),
    ).rejects.toThrow();

    const summary = await runWithTenant(tenantId, () => paymentService.getPaymentSummary(invoice.id, tenantId));
    expect(summary.paidAmount).toBe('30000.00'); // second attempt never recorded
  });

  it('an invoice number that belongs to a DIFFERENT tenant is not found — RLS + assertTenantMatchesSession together', async () => {
    const { invoice: victimInvoice } = await seedInvoice('Forwarding Tenant Victim', '60000.00');
    // A bare tenant with ZERO invoices of its own — invoice numbers are a
    // PER-TENANT sequence (both tenants' first invoice is legitimately
    // "INV-2026-000001"), so this only proves cross-tenant isolation
    // cleanly if the attacker has no invoice that could coincidentally
    // share the victim's number.
    const [attackerTenant] = await db.insert(tenants).values({ legalName: 'Forwarding Tenant Attacker', industry: 'food_beverage' }).returning();
    const attackerTenantId = attackerTenant!.id;

    await expect(
      runWithTenant(attackerTenantId, () =>
        paymentService.recordPaymentByInvoiceNumber(attackerTenantId, victimInvoice.invoiceNumber, { method: 'bank_transfer', amount: '1.00' }),
      ),
    ).rejects.toThrow();
  });
});
