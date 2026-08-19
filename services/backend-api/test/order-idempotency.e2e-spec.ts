import { describe, it, expect } from 'vitest';
import { db } from '../src/db/client';
import { tenants } from '../src/db/schema/tenants';
import { skus } from '../src/db/schema/skus';
import { withTenantTransaction } from '../src/platform/tenant-context';
import { LotDrizzleRepository } from '../src/modules/catalog-inventory/infrastructure/persistence/lot.drizzle-repository';
import { SkuDrizzleRepository } from '../src/modules/catalog-inventory/infrastructure/persistence/sku.drizzle-repository';
import { OrderDrizzleRepository } from '../src/modules/sales-order/infrastructure/persistence/order.drizzle-repository';
import { OrderService } from '../src/modules/sales-order/application/order.service';
import { runWithTenant } from '../src/platform/tenant-context';

/**
 * Mục 5.2 made concrete for `placeOrder`: a retried request with the SAME
 * Idempotency-Key must consume stock exactly once, not once per HTTP retry.
 * Real Postgres, real OrderService, no mocks.
 */

const lotRepo = new LotDrizzleRepository();
const skuRepo = new SkuDrizzleRepository();
const orderRepo = new OrderDrizzleRepository();
const orderService = new OrderService(orderRepo, lotRepo, skuRepo);

async function seedTenantSkuLot(qty: string) {
  const [tenant] = await db.insert(tenants).values({ legalName: 'Idempotency Test Tenant', industry: 'food_beverage' }).returning();
  const sku = await withTenantTransaction(db, tenant!.id, async (tx) => {
    const rows = await tx
      .insert(skus)
      .values({ tenantId: tenant!.id, skuCode: `SKU-IDEM-${Date.now()}`, name: 'Nước mắm nhĩ', unit: 'chai', unitPrice: '85000' })
      .returning();
    return rows[0]!;
  });
  const lot = await lotRepo.receive(tenant!.id, { skuId: sku.id, lotCode: `LOT-IDEM-${Date.now()}`, quantity: qty });
  return { tenantId: tenant!.id, skuId: sku.id, lot };
}

describe('placeOrder idempotency (Mục 5.2) — real Postgres, no mocks', () => {
  it('the same Idempotency-Key retried 3 times consumes stock exactly once and returns the same order', async () => {
    const { tenantId, skuId, lot } = await seedTenantSkuLot('10');
    const idempotencyKey = `test-key-${Date.now()}`;

    const attempt = () =>
      runWithTenant(tenantId, () =>
        orderService.placeOrder(tenantId, idempotencyKey, {
          channel: 'counter',
          lines: [{ skuId, lotId: lot.id, quantity: '3' }],
        }),
      );

    const [first, second, third] = await Promise.all([attempt(), attempt(), attempt()]);

    // Same cached order returned every time — not three separate orders.
    expect(first.id).toBe(second.id);
    expect(second.id).toBe(third.id);

    const finalLot = await lotRepo.findById(lot.id, tenantId);
    // 10 - 3 = 7, not 10 - 9 = 1 (which is what re-running 3 times would do).
    expect(finalLot!.quantityOnHand).toBe('7.000');
  });

  it('a genuinely new order (different key) DOES consume stock again', async () => {
    const { tenantId, skuId, lot } = await seedTenantSkuLot('10');

    await runWithTenant(tenantId, () =>
      orderService.placeOrder(tenantId, 'key-a', { channel: 'counter', lines: [{ skuId, lotId: lot.id, quantity: '3' }] }),
    );
    await runWithTenant(tenantId, () =>
      orderService.placeOrder(tenantId, 'key-b', { channel: 'counter', lines: [{ skuId, lotId: lot.id, quantity: '3' }] }),
    );

    const finalLot = await lotRepo.findById(lot.id, tenantId);
    expect(finalLot!.quantityOnHand).toBe('4.000'); // 10 - 3 - 3
  });

  it('insufficient stock rolls back the WHOLE transaction — no order recorded, idempotency key not burned', async () => {
    const { tenantId, skuId, lot } = await seedTenantSkuLot('2');
    const idempotencyKey = `test-key-fail-${Date.now()}`;

    await expect(
      runWithTenant(tenantId, () =>
        orderService.placeOrder(tenantId, idempotencyKey, { channel: 'counter', lines: [{ skuId, lotId: lot.id, quantity: '5' }] }),
      ),
    ).rejects.toThrow();

    const orders = await runWithTenant(tenantId, () => orderService.listOrders(tenantId));
    expect(orders).toHaveLength(0);

    const finalLot = await lotRepo.findById(lot.id, tenantId);
    expect(finalLot!.quantityOnHand).toBe('2.000'); // untouched

    // Retry with the SAME key must be allowed to succeed now (key wasn't burned).
    const retried = await runWithTenant(tenantId, () =>
      orderService.placeOrder(tenantId, idempotencyKey, { channel: 'counter', lines: [{ skuId, lotId: lot.id, quantity: '2' }] }),
    );
    expect(retried.id).toBeDefined();
  });
});
