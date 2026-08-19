import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../src/db/client';
import { tenants } from '../src/db/schema/tenants';
import { skus } from '../src/db/schema/skus';
import { withTenantTransaction } from '../src/platform/tenant-context';
import { LotDrizzleRepository } from '../src/modules/catalog-inventory/infrastructure/persistence/lot.drizzle-repository';

/**
 * Mục 11's named risk, made concrete: "hai đơn cùng tiêu 1 lô cuối" — two
 * orders consuming the last unit of stock. If this ever regresses to
 * read-then-write application logic instead of the atomic guarded UPDATE in
 * `LotDrizzleRepository`, this test is what catches it — not a unit test on
 * mocked data, real concurrent transactions against real Postgres.
 */

const lotRepo = new LotDrizzleRepository();

async function seedTenantWithLot(legalName: string, qty: string) {
  const [tenant] = await db.insert(tenants).values({ legalName, industry: 'food_beverage' }).returning();
  const sku = await withTenantTransaction(db, tenant!.id, async (tx) => {
    const rows = await tx
      .insert(skus)
      .values({ tenantId: tenant!.id, skuCode: `SKU-${Date.now()}`, name: 'Test item', unit: 'kg', unitPrice: '50000' })
      .returning();
    return rows[0]!;
  });
  const lot = await lotRepo.receive(tenant!.id, { skuId: sku.id, lotCode: `LOT-${Date.now()}`, quantity: qty });
  return { tenantId: tenant!.id, skuId: sku.id, lot };
}

describe('Inventory race safety (Mục 11) — real concurrent consumeDirect on the last unit', () => {
  it('exactly one of two concurrent sales for the last unit succeeds, the other sees insufficient stock', async () => {
    const { tenantId, lot } = await seedTenantWithLot('Race Test Tenant', '1'); // exactly 1 unit on hand

    const results = await Promise.all([
      lotRepo.consumeDirect(lot.id, tenantId, '1', undefined),
      lotRepo.consumeDirect(lot.id, tenantId, '1', undefined),
    ]);

    const succeeded = results.filter((r) => r !== null);
    const failed = results.filter((r) => r === null);

    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);

    const finalLot = await lotRepo.findById(lot.id, tenantId);
    expect(finalLot!.quantityOnHand).toBe('0.000');
    // Never negative — the exact failure mode this design prevents.
    expect(Number(finalLot!.quantityOnHand)).toBeGreaterThanOrEqual(0);
  });

  it('20 concurrent sale attempts against 10 available units: exactly 10 succeed, 10 fail, never oversold', async () => {
    const { tenantId, lot } = await seedTenantWithLot('Race Test Tenant Bulk', '10');

    const results = await Promise.all(
      Array.from({ length: 20 }, () => lotRepo.consumeDirect(lot.id, tenantId, '1', undefined)),
    );

    const succeeded = results.filter((r) => r !== null);
    expect(succeeded).toHaveLength(10);

    const finalLot = await lotRepo.findById(lot.id, tenantId);
    expect(finalLot!.quantityOnHand).toBe('0.000');
    expect(Number(finalLot!.quantityOnHand)).toBeGreaterThanOrEqual(0);
  });

  it('reserve does not allow oversubscription beyond available stock, released holds free the quantity back up', async () => {
    const { tenantId, lot } = await seedTenantWithLot('Reserve Test Tenant', '5');

    const reserve3 = await lotRepo.reserve(lot.id, tenantId, '3');
    expect(reserve3).not.toBeNull();

    // Only 2 left available (5 on hand - 3 reserved) — reserving 3 more must fail.
    const reserveTooMuch = await lotRepo.reserve(lot.id, tenantId, '3');
    expect(reserveTooMuch).toBeNull();

    const released = await lotRepo.release(lot.id, tenantId, '3');
    expect(released).not.toBeNull();
    expect(released!.quantityReserved).toBe('0.000');

    // Now the full 5 should be reservable again.
    const reserveAfterRelease = await lotRepo.reserve(lot.id, tenantId, '5');
    expect(reserveAfterRelease).not.toBeNull();
  });
});
