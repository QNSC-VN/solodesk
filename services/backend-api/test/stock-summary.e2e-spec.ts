import { describe, it, expect } from 'vitest';
import { db } from '../src/db/client';
import { tenants } from '../src/db/schema/tenants';
import { withTenantTransaction, runWithTenant } from '../src/platform/tenant-context';
import { SkuDrizzleRepository } from '../src/modules/catalog-inventory/infrastructure/persistence/sku.drizzle-repository';
import { LotDrizzleRepository } from '../src/modules/catalog-inventory/infrastructure/persistence/lot.drizzle-repository';
import { InventoryService } from '../src/modules/catalog-inventory/application/inventory.service';

/**
 * Real Postgres, no mocks — `InventoryService.getStockSummary`, the stock
 * page's real data source (web-accounting). Confirms the batched
 * `listAvailableQuantitiesByTenant` join is correct: a SKU with lots
 * received shows its real aggregated quantity, and a SKU with none yet
 * still appears, zeroed out, rather than silently missing.
 */

const skuRepo = new SkuDrizzleRepository();
const lotRepo = new LotDrizzleRepository();
const inventoryService = new InventoryService(lotRepo, skuRepo);

async function seedTenant(legalName: string): Promise<string> {
  const [tenant] = await db.insert(tenants).values({ legalName, industry: 'food_beverage' }).returning();
  return tenant!.id;
}

describe('InventoryService.getStockSummary — real Postgres, no mocks', () => {
  it('combines SKU catalog data with real aggregated stock quantity across lots', async () => {
    const tenantId = await seedTenant('Stock Summary Test Tenant');

    const skuWithStock = await runWithTenant(tenantId, () =>
      skuRepo.create(tenantId, { skuCode: `SKU-STOCK-${Date.now()}`, name: 'Ca phe rang', unit: 'kg', unitPrice: '150000.00' }),
    );
    await withTenantTransaction(db, tenantId, () => lotRepo.receive(tenantId, { skuId: skuWithStock.id, lotCode: `LOT-A-${Date.now()}`, quantity: '20' }));
    await withTenantTransaction(db, tenantId, () => lotRepo.receive(tenantId, { skuId: skuWithStock.id, lotCode: `LOT-B-${Date.now()}`, quantity: '10' }));

    const skuNoStock = await runWithTenant(tenantId, () =>
      skuRepo.create(tenantId, { skuCode: `SKU-NOSTOCK-${Date.now()}`, name: 'Chua nhap kho', unit: 'kg', unitPrice: '80000.00' }),
    );

    const summary = await runWithTenant(tenantId, () => inventoryService.getStockSummary(tenantId));

    const withStock = summary.find((s) => s.skuId === skuWithStock.id);
    expect(withStock).toBeDefined();
    expect(withStock!.totalOnHand).toBe('30.000');
    expect(withStock!.totalAvailable).toBe('30.000');

    const noStock = summary.find((s) => s.skuId === skuNoStock.id);
    expect(noStock).toBeDefined();
    expect(noStock!.totalOnHand).toBe('0');
    expect(noStock!.totalAvailable).toBe('0');
  });

  it('a tenant with zero SKUs gets an empty array, not an error', async () => {
    const tenantId = await seedTenant('Stock Summary Empty Tenant');

    const summary = await runWithTenant(tenantId, () => inventoryService.getStockSummary(tenantId));

    expect(summary).toEqual([]);
  });
});
