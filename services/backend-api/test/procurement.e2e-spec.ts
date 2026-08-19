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

/** Real Postgres, no mocks — negotiated-price versioning, stock receipt, and purchase idempotency. */

const lotRepo = new LotDrizzleRepository();
const skuRepo = new SkuDrizzleRepository();
const catalogService = new CatalogService(skuRepo);

const supplierRepo = new SupplierDrizzleRepository();
const negotiatedPriceRepo = new NegotiatedPriceDrizzleRepository();
const purchaseNoteRepo = new PurchaseNoteDrizzleRepository();

const supplierService = new SupplierService(supplierRepo);
const negotiatedPriceService = new NegotiatedPriceService(negotiatedPriceRepo, supplierService, catalogService);
const purchaseNoteService = new PurchaseNoteService(purchaseNoteRepo, negotiatedPriceRepo, lotRepo, skuRepo, supplierService);

let counter = 0;

async function seedTenantSupplierSku(legalName: string) {
  const [tenant] = await db.insert(tenants).values({ legalName, industry: 'agriculture' }).returning();
  const tenantId = tenant!.id;
  counter += 1;
  const sku = await withTenantTransaction(db, tenantId, async (tx) => {
    const rows = await tx
      .insert(skus)
      .values({ tenantId, skuCode: `SKU-PROC-${Date.now()}-${counter}`, name: 'Cà phê nhân xô', unit: 'kg', unitPrice: '100000' })
      .returning();
    return rows[0]!;
  });
  const supplier = await runWithTenant(tenantId, () => supplierService.createSupplier(tenantId, { name: 'Nông hộ A' }));
  return { tenantId, sku, supplier };
}

describe('Procurement — real Postgres, no mocks', () => {
  it('recording a purchase without a negotiated price and no explicit unitCost is rejected', async () => {
    const { tenantId, sku, supplier } = await seedTenantSupplierSku('Procurement Tenant NoPrice');

    await expect(
      runWithTenant(tenantId, () =>
        purchaseNoteService.recordPurchase(tenantId, `proc-key-${Date.now()}`, {
          supplierId: supplier.id,
          lines: [{ skuId: sku.id, lotCode: `LOT-PROC-${Date.now()}`, quantity: '10' }],
        }),
      ),
    ).rejects.toThrow();
  });

  it('an explicit unitCost overrides the missing negotiated price', async () => {
    const { tenantId, sku, supplier } = await seedTenantSupplierSku('Procurement Tenant ExplicitCost');

    const note = await runWithTenant(tenantId, () =>
      purchaseNoteService.recordPurchase(tenantId, `proc-key-${Date.now()}`, {
        supplierId: supplier.id,
        lines: [{ skuId: sku.id, lotCode: `LOT-PROC-${Date.now()}`, quantity: '10', unitCost: '30000.00' }],
      }),
    );

    expect(note.totalAmount).toBe('300000.00');
    expect(note.lines[0]!.unitCost).toBe('30000.00');

    const qty = await lotRepo.getAvailableQuantity(sku.id, tenantId);
    expect(qty.totalOnHand).toBe('10.000');
  });

  it('setting a negotiated price is used automatically when no unitCost is given, and receives real stock', async () => {
    const { tenantId, sku, supplier } = await seedTenantSupplierSku('Procurement Tenant Negotiated');

    await runWithTenant(tenantId, () => negotiatedPriceService.setPrice(tenantId, supplier.id, sku.id, '25000.00'));

    const note = await runWithTenant(tenantId, () =>
      purchaseNoteService.recordPurchase(tenantId, `proc-key-${Date.now()}`, {
        supplierId: supplier.id,
        lines: [{ skuId: sku.id, lotCode: `LOT-PROC-${Date.now()}`, quantity: '20' }],
      }),
    );

    expect(note.lines[0]!.unitCost).toBe('25000.00');
    expect(note.totalAmount).toBe('500000.00');

    const qty = await lotRepo.getAvailableQuantity(sku.id, tenantId);
    expect(qty.totalOnHand).toBe('20.000');
  });

  it('setting a new negotiated price closes the old one, but an already-recorded purchase note keeps its snapshotted cost', async () => {
    const { tenantId, sku, supplier } = await seedTenantSupplierSku('Procurement Tenant Repriced');

    await runWithTenant(tenantId, () => negotiatedPriceService.setPrice(tenantId, supplier.id, sku.id, '25000.00'));
    const noteAtOldPrice = await runWithTenant(tenantId, () =>
      purchaseNoteService.recordPurchase(tenantId, `proc-key-old-${Date.now()}`, {
        supplierId: supplier.id,
        lines: [{ skuId: sku.id, lotCode: `LOT-PROC-OLD-${Date.now()}`, quantity: '5' }],
      }),
    );

    await runWithTenant(tenantId, () => negotiatedPriceService.setPrice(tenantId, supplier.id, sku.id, '28000.00'));
    const noteAtNewPrice = await runWithTenant(tenantId, () =>
      purchaseNoteService.recordPurchase(tenantId, `proc-key-new-${Date.now()}`, {
        supplierId: supplier.id,
        lines: [{ skuId: sku.id, lotCode: `LOT-PROC-NEW-${Date.now()}`, quantity: '5' }],
      }),
    );

    expect(noteAtOldPrice.lines[0]!.unitCost).toBe('25000.00'); // unchanged even after repricing
    expect(noteAtNewPrice.lines[0]!.unitCost).toBe('28000.00');
  });

  it('the same idempotency key retried does not receive stock twice', async () => {
    const { tenantId, sku, supplier } = await seedTenantSupplierSku('Procurement Tenant Idempotent');
    const key = `proc-idem-${Date.now()}`;

    const attempt = () =>
      runWithTenant(tenantId, () =>
        purchaseNoteService.recordPurchase(tenantId, key, {
          supplierId: supplier.id,
          lines: [{ skuId: sku.id, lotCode: `LOT-PROC-IDEM-${Date.now()}`, quantity: '10', unitCost: '10000.00' }],
        }),
      );

    const [first, second] = await Promise.all([attempt(), attempt()]);
    expect(first.id).toBe(second.id);

    const qty = await lotRepo.getAvailableQuantity(sku.id, tenantId);
    expect(qty.totalOnHand).toBe('10.000'); // not 20 — the retry never ran twice
  });
});
