import { describe, it, expect } from 'vitest';
import { db } from '../src/db/client';
import { tenants } from '../src/db/schema/tenants';
import { skus } from '../src/db/schema/skus';
import { runWithTenant, withTenantTransaction } from '../src/platform/tenant-context';
import { LotDrizzleRepository } from '../src/modules/catalog-inventory/infrastructure/persistence/lot.drizzle-repository';
import { SkuDrizzleRepository } from '../src/modules/catalog-inventory/infrastructure/persistence/sku.drizzle-repository';
import { CatalogService } from '../src/modules/catalog-inventory/application/catalog.service';
import { SupplierDrizzleRepository } from '../src/modules/procurement/infrastructure/persistence/supplier.drizzle-repository';
import { NegotiatedPriceDrizzleRepository } from '../src/modules/procurement/infrastructure/persistence/negotiated-price.drizzle-repository';
import { PurchaseNoteDrizzleRepository } from '../src/modules/procurement/infrastructure/persistence/purchase-note.drizzle-repository';
import { SupplierService } from '../src/modules/procurement/application/supplier.service';
import { NegotiatedPriceService } from '../src/modules/procurement/application/negotiated-price.service';
import { PurchaseNoteService } from '../src/modules/procurement/application/purchase-note.service';
import { LotTraceDrizzleRepository } from '../src/modules/traceability/infrastructure/persistence/lot-trace.drizzle-repository';
import { TraceabilityService } from '../src/modules/traceability/application/traceability.service';

/**
 * Real Postgres, no mocks — the public-QR-read path is the thing that
 * matters most here: it must work with ZERO tenant context, and it must
 * never expose anything about a lot that was never explicitly published.
 */

const lotRepo = new LotDrizzleRepository();
const skuRepo = new SkuDrizzleRepository();
const catalogService = new CatalogService(skuRepo);

const supplierRepo = new SupplierDrizzleRepository();
const negotiatedPriceRepo = new NegotiatedPriceDrizzleRepository();
const purchaseNoteRepo = new PurchaseNoteDrizzleRepository();
const supplierService = new SupplierService(supplierRepo);
const negotiatedPriceService = new NegotiatedPriceService(negotiatedPriceRepo, supplierService, catalogService);
const purchaseNoteService = new PurchaseNoteService(purchaseNoteRepo, negotiatedPriceRepo, lotRepo, skuRepo, supplierService);

const lotTraceRepo = new LotTraceDrizzleRepository();
const traceabilityService = new TraceabilityService(lotTraceRepo, lotRepo, skuRepo, purchaseNoteRepo);

let counter = 0;

async function seedTenantSku(legalName: string) {
  const [tenant] = await db.insert(tenants).values({ legalName, industry: 'agriculture' }).returning();
  const tenantId = tenant!.id;
  counter += 1;
  const sku = await withTenantTransaction(db, tenantId, async (tx) => {
    const rows = await tx
      .insert(skus)
      .values({ tenantId, skuCode: `SKU-TRACE-${Date.now()}-${counter}`, name: 'Ca phe Arabica', unit: 'kg', unitPrice: '150000', category: 'coffee' })
      .returning();
    return rows[0]!;
  });
  return { tenantId, sku };
}

describe('Traceability — real Postgres, no mocks', () => {
  it('a lot received via a purchase note publishes with the supplier name attached', async () => {
    const { tenantId, sku } = await seedTenantSku('Trace Tenant Supplier');
    const supplier = await runWithTenant(tenantId, () => supplierService.createSupplier(tenantId, { name: 'Nong Trai Trace Test' }));
    const note = await runWithTenant(tenantId, () =>
      purchaseNoteService.recordPurchase(tenantId, `trace-key-${Date.now()}`, {
        supplierId: supplier.id,
        lines: [{ skuId: sku.id, lotCode: `LOT-TRACE-${Date.now()}`, quantity: '30', unitCost: '20000.00' }],
      }),
    );
    const lotId = note.lines[0]!.lotId;

    const published = await runWithTenant(tenantId, () => traceabilityService.publishLotTrace(tenantId, lotId));
    expect(published.supplierName).toBe('Nong Trai Trace Test');
    expect(published.skuName).toBe('Ca phe Arabica');
    expect(published.skuCategory).toBe('coffee');

    // The public read: ZERO tenant context, no runWithTenant wrapper at all.
    const publicTrace = await traceabilityService.getPublicTrace(lotId);
    expect(publicTrace.supplierName).toBe('Nong Trai Trace Test');
    expect(publicTrace.lotCode).toBe(published.lotCode);
  });

  it('a lot received without a purchase note (manual receive) publishes with no supplier name', async () => {
    const { tenantId, sku } = await seedTenantSku('Trace Tenant NoSupplier');
    const lot = await lotRepo.receive(tenantId, { skuId: sku.id, lotCode: `LOT-TRACE-MANUAL-${Date.now()}`, quantity: '5' });

    const published = await runWithTenant(tenantId, () => traceabilityService.publishLotTrace(tenantId, lot.id));
    expect(published.supplierName).toBeNull();

    const publicTrace = await traceabilityService.getPublicTrace(lot.id);
    expect(publicTrace.supplierName).toBeNull();
    expect(publicTrace.skuName).toBe('Ca phe Arabica');
  });

  it('a lot that was never published returns not-found on the public path', async () => {
    const { tenantId, sku } = await seedTenantSku('Trace Tenant Unpublished');
    const lot = await lotRepo.receive(tenantId, { skuId: sku.id, lotCode: `LOT-TRACE-UNPUB-${Date.now()}`, quantity: '5' });

    await expect(traceabilityService.getPublicTrace(lot.id)).rejects.toThrow();
  });

  it('a tenant cannot publish a lot it does not own', async () => {
    const { tenantId: ownerTenantId, sku } = await seedTenantSku('Trace Tenant Owner');
    const lot = await lotRepo.receive(ownerTenantId, { skuId: sku.id, lotCode: `LOT-TRACE-XTENANT-${Date.now()}`, quantity: '5' });

    const { tenantId: attackerTenantId } = await seedTenantSku('Trace Tenant Attacker');

    await expect(runWithTenant(attackerTenantId, () => traceabilityService.publishLotTrace(attackerTenantId, lot.id))).rejects.toThrow();

    // Confirms it was never published under the attacker's attempt either.
    await expect(traceabilityService.getPublicTrace(lot.id)).rejects.toThrow();
  });

  it('re-publishing the same lot updates the snapshot rather than erroring', async () => {
    const { tenantId, sku } = await seedTenantSku('Trace Tenant Republish');
    const lot = await lotRepo.receive(tenantId, { skuId: sku.id, lotCode: `LOT-TRACE-REPUB-${Date.now()}`, quantity: '5' });

    const first = await runWithTenant(tenantId, () => traceabilityService.publishLotTrace(tenantId, lot.id));
    const second = await runWithTenant(tenantId, () => traceabilityService.publishLotTrace(tenantId, lot.id));

    expect(first.lotId).toBe(second.lotId);
    expect(second.publishedAt.getTime()).toBeGreaterThanOrEqual(first.publishedAt.getTime());
  });
});
