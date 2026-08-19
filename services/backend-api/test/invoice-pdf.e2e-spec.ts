import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db } from '../src/db/client';
import { tenants } from '../src/db/schema/tenants';
import { skus } from '../src/db/schema/skus';
import { withTenantTransaction, runWithTenant } from '../src/platform/tenant-context';
import { LotDrizzleRepository } from '../src/modules/catalog-inventory/infrastructure/persistence/lot.drizzle-repository';
import { SkuDrizzleRepository } from '../src/modules/catalog-inventory/infrastructure/persistence/sku.drizzle-repository';
import { CatalogService } from '../src/modules/catalog-inventory/application/catalog.service';
import { OrderDrizzleRepository } from '../src/modules/sales-order/infrastructure/persistence/order.drizzle-repository';
import { OrderService } from '../src/modules/sales-order/application/order.service';
import { TenantDrizzleRepository } from '../src/modules/identity-tenant/infrastructure/persistence/tenant.drizzle-repository';
import { TenantMemberDrizzleRepository } from '../src/modules/identity-tenant/infrastructure/persistence/tenant-member.drizzle-repository';
import { TenantService } from '../src/modules/identity-tenant/application/tenant.service';
import { TaxRuleDrizzleRepository } from '../src/modules/invoicing-tax/infrastructure/persistence/tax-rule.drizzle-repository';
import { InvoiceDrizzleRepository } from '../src/modules/invoicing-tax/infrastructure/persistence/invoice.drizzle-repository';
import { TaxCalculationService } from '../src/modules/invoicing-tax/application/tax-calculation.service';
import { InvoiceService } from '../src/modules/invoicing-tax/application/invoice.service';
import { InvoicePdfService } from '../src/modules/invoicing-tax/application/invoice-pdf.service';
import { getInvoicePdfQueue } from '../src/platform/queue';
import type { Env } from '../src/config/env.schema';
import type { ConfigService } from '@nestjs/config';

/**
 * Real Postgres, real Valkey (BullMQ), no mocks. Services constructed
 * directly (same style as invoice-tax.e2e-spec.ts), bypassing Nest's DI
 * container — a fake ConfigService just returns the test's own temp dir
 * for GENERATED_FILES_DIR, so generated PDFs never touch the real
 * ./generated directory a dev server might be using concurrently.
 */

const lotRepo = new LotDrizzleRepository();
const skuRepo = new SkuDrizzleRepository();
const orderRepo = new OrderDrizzleRepository();
const orderService = new OrderService(orderRepo, lotRepo, skuRepo);
const catalogService = new CatalogService(skuRepo);

const tenantService = new TenantService(new TenantDrizzleRepository(), new TenantMemberDrizzleRepository());
const taxCalculationService = new TaxCalculationService(new TaxRuleDrizzleRepository());
const invoiceRepo = new InvoiceDrizzleRepository();
const invoiceService = new InvoiceService(invoiceRepo, taxCalculationService, orderService, tenantService);

let tempDir: string;
let invoicePdfService: InvoicePdfService;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'solodesk-pdf-test-'));
  const fakeConfig = { get: () => tempDir } as unknown as ConfigService<Env>;
  invoicePdfService = new InvoicePdfService(invoiceService, orderService, tenantService, catalogService, fakeConfig);
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
  await getInvoicePdfQueue().close();
});

let keyCounter = 0;

async function seedTenantWithInvoice(legalName: string) {
  const [tenant] = await db.insert(tenants).values({ legalName, industry: 'food_beverage' }).returning();
  const tenantId = tenant!.id;

  const sku = await withTenantTransaction(db, tenantId, async (tx) => {
    const rows = await tx
      .insert(skus)
      .values({ tenantId, skuCode: `SKU-PDF-${Date.now()}-${keyCounter}`, name: 'Ca phe Robusta', unit: 'kg', unitPrice: '120000.00' })
      .returning();
    return rows[0]!;
  });
  const lot = await lotRepo.receive(tenantId, { skuId: sku.id, lotCode: `LOT-PDF-${Date.now()}-${keyCounter}`, quantity: '10' });
  keyCounter += 1;

  const order = await runWithTenant(tenantId, () =>
    orderService.placeOrder(tenantId, `pdf-test-key-${Date.now()}-${keyCounter}`, {
      channel: 'counter',
      customerName: 'Chi Mai',
      lines: [{ skuId: sku.id, lotId: lot.id, quantity: '2', unitPrice: '120000.00' }],
    }),
  );
  const invoice = await runWithTenant(tenantId, () => invoiceService.issueInvoice(tenantId, order.id));

  return { tenantId, invoice };
}

describe('InvoicePdfService.renderInvoicePdf — real Postgres, real pdfkit rendering', () => {
  it('produces a real, valid, non-trivial PDF buffer for a real invoice', async () => {
    const { tenantId, invoice } = await seedTenantWithInvoice('PDF Test Tenant Coffee');

    const buffer = await runWithTenant(tenantId, () => invoicePdfService.renderInvoicePdf(invoice.id, tenantId));

    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(500); // a real rendered page, not an empty/near-empty document
  });

  it('rejects rendering an invoice belonging to a different tenant', async () => {
    const { invoice } = await seedTenantWithInvoice('PDF Test Tenant Owner');
    const [otherTenant] = await db.insert(tenants).values({ legalName: 'PDF Test Tenant Attacker', industry: 'food_beverage' }).returning();

    await expect(runWithTenant(otherTenant!.id, () => invoicePdfService.renderInvoicePdf(invoice.id, otherTenant!.id))).rejects.toThrow();
  });
});

describe('InvoicePdfService — generated-file read/write round trip, real filesystem', () => {
  it('readGeneratedPdf returns null before generation, then the real bytes after writeGeneratedPdf', async () => {
    const { tenantId, invoice } = await seedTenantWithInvoice('PDF Test Tenant Filesystem');

    expect(await invoicePdfService.readGeneratedPdf(invoice.id, tenantId)).toBeNull();

    const rendered = await runWithTenant(tenantId, () => invoicePdfService.renderInvoicePdf(invoice.id, tenantId));
    await invoicePdfService.writeGeneratedPdf(invoice.id, tenantId, rendered);

    const readBack = await invoicePdfService.readGeneratedPdf(invoice.id, tenantId);
    expect(readBack).not.toBeNull();
    expect(readBack!.equals(rendered)).toBe(true);
  });
});

describe('InvoicePdfService.enqueueGeneratePdf — real BullMQ queue, real Valkey', () => {
  it('enqueues a real job carrying the correct invoiceId/tenantId, and rejects an unowned invoice before enqueuing', async () => {
    const { tenantId, invoice } = await seedTenantWithInvoice('PDF Test Tenant Queue');

    const { jobId } = await runWithTenant(tenantId, () => invoicePdfService.enqueueGeneratePdf(invoice.id, tenantId));

    const job = await getInvoicePdfQueue().getJob(jobId);
    expect(job).not.toBeNull();
    expect(job!.data).toEqual({ invoiceId: invoice.id, tenantId });
    await job!.remove();

    const [otherTenant] = await db.insert(tenants).values({ legalName: 'PDF Test Tenant Queue Attacker', industry: 'food_beverage' }).returning();
    await expect(runWithTenant(otherTenant!.id, () => invoicePdfService.enqueueGeneratePdf(invoice.id, otherTenant!.id))).rejects.toThrow();
  });
});
