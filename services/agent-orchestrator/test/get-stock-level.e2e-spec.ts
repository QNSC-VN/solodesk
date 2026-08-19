import { describe, it, expect, afterAll } from 'vitest';
import postgres from 'postgres';
import { getStockLevel } from '../src/temporal/activities/tools/get-stock-level.tool';

/** Real Postgres, no mocks — fixtures seeded via the admin connection, same reasoning as get-sales-summary.e2e-spec.ts. */

const adminSql = postgres(process.env.DATABASE_ADMIN_URL!, { max: 1 });

afterAll(async () => {
  await adminSql.end();
});

async function seedTenant(legalName: string): Promise<string> {
  const rows = await adminSql`INSERT INTO identity.tenants (legal_name, industry) VALUES (${legalName}, 'food_beverage') RETURNING id`;
  return rows[0]!.id as string;
}

async function seedSku(tenantId: string, skuCode: string, name: string): Promise<string> {
  const rows = await adminSql`
    INSERT INTO catalog.skus (tenant_id, sku_code, name, unit, unit_price)
    VALUES (${tenantId}, ${skuCode}, ${name}, 'cai', '10000.00')
    RETURNING id
  `;
  return rows[0]!.id as string;
}

async function seedLot(tenantId: string, skuId: string, quantityOnHand: string, quantityReserved: string): Promise<void> {
  await adminSql`
    INSERT INTO catalog.lots (tenant_id, sku_id, lot_code, quantity_on_hand, quantity_reserved, received_at)
    VALUES (${tenantId}, ${skuId}, ${'LOT-' + Math.random().toString(36).slice(2)}, ${quantityOnHand}, ${quantityReserved}, now())
  `;
}

describe('getStockLevel tool — real Postgres, no mocks', () => {
  it('sums available quantity (on hand minus reserved) across multiple lots', async () => {
    const tenantId = await seedTenant('Agent Test Tenant Stock');
    const skuId = await seedSku(tenantId, 'SKU-STOCK-1', 'Ca phe rang xay');
    await seedLot(tenantId, skuId, '10', '2');
    await seedLot(tenantId, skuId, '5', '0');

    const result = await getStockLevel({ tenantId, skuCode: 'SKU-STOCK-1' });

    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.skuName).toBe('Ca phe rang xay');
      expect(Number(result.quantityAvailable)).toBe(13); // (10-2) + (5-0)
    }
  });

  it('an unknown SKU code returns found:false, not an error', async () => {
    const tenantId = await seedTenant('Agent Test Tenant Stock Unknown');

    const result = await getStockLevel({ tenantId, skuCode: 'SKU-DOES-NOT-EXIST' });

    expect(result.found).toBe(false);
    expect(result.skuCode).toBe('SKU-DOES-NOT-EXIST');
  });

  it('the SAME SKU code in a DIFFERENT tenant is not found — RLS scopes the lookup, not just the code match', async () => {
    const tenantA = await seedTenant('Agent Test Tenant Stock A');
    const tenantB = await seedTenant('Agent Test Tenant Stock B');
    const skuIdA = await seedSku(tenantA, 'SKU-SHARED-CODE', 'Tenant A item');
    await seedLot(tenantA, skuIdA, '7', '0');
    // Tenant B never created this SKU code at all.

    const resultB = await getStockLevel({ tenantId: tenantB, skuCode: 'SKU-SHARED-CODE' });

    expect(resultB.found).toBe(false);
  });
});
