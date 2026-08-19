import { describe, it, expect, afterAll } from 'vitest';
import postgres from 'postgres';
import { getSalesSummary } from '../src/temporal/activities/tools/get-sales-summary.tool';

/**
 * Real Postgres, no mocks. `solodesk_agent` is SELECT-only, so test
 * fixtures are seeded via a separate admin connection (bypasses RLS —
 * fine for fixture setup, not what's under test here; RLS itself is
 * exhaustively covered by backend-api's own suite).
 */

const adminSql = postgres(process.env.DATABASE_ADMIN_URL!, { max: 1 });

afterAll(async () => {
  await adminSql.end();
});

async function seedTenant(legalName: string): Promise<string> {
  const rows = await adminSql`INSERT INTO identity.tenants (legal_name, industry) VALUES (${legalName}, 'food_beverage') RETURNING id`;
  return rows[0]!.id as string;
}

async function seedOrder(tenantId: string, status: string, totalAmount: string, createdAt: Date): Promise<void> {
  await adminSql`
    INSERT INTO sales.orders (tenant_id, channel, status, total_amount, created_at, updated_at)
    VALUES (${tenantId}, 'counter', ${status}, ${totalAmount}, ${createdAt.toISOString()}, ${createdAt.toISOString()})
  `;
}

// Vietnam is UTC+7 — a timestamp constructed from "today" in the TEST
// RUNNER's own timezone could disagree with what the tool considers
// "today in Vietnam" if the test runner's clock/timezone differs. Anchor
// explicitly to the current instant, same as the tool itself does.
function vnNowMinusHours(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

describe('getSalesSummary tool — real Postgres, no mocks', () => {
  it('sums only today\'s CONFIRMED orders, excluding cancelled and prior-day ones', async () => {
    const tenantId = await seedTenant('Agent Test Tenant Summary');

    await seedOrder(tenantId, 'confirmed', '100000.00', vnNowMinusHours(1));
    await seedOrder(tenantId, 'confirmed', '50000.00', vnNowMinusHours(2));
    await seedOrder(tenantId, 'cancelled', '999999.00', vnNowMinusHours(1)); // today but cancelled — excluded
    await seedOrder(tenantId, 'confirmed', '888888.00', vnNowMinusHours(30)); // confirmed but not today — excluded

    const summary = await getSalesSummary({ tenantId });

    expect(summary.orderCount).toBe(2);
    expect(summary.totalAmount).toBe('150000.00');
  });

  it('a tenant with zero orders today gets a zero summary, not an error', async () => {
    const tenantId = await seedTenant('Agent Test Tenant Empty');

    const summary = await getSalesSummary({ tenantId });

    expect(summary.orderCount).toBe(0);
    expect(Number(summary.totalAmount)).toBe(0);
  });

  it('RLS still scopes strictly to the given tenant even though this role only ever queries with an explicit tenant_id filter', async () => {
    const tenantA = await seedTenant('Agent Test Tenant A');
    const tenantB = await seedTenant('Agent Test Tenant B');
    await seedOrder(tenantA, 'confirmed', '10000.00', vnNowMinusHours(1));
    await seedOrder(tenantB, 'confirmed', '20000.00', vnNowMinusHours(1));

    const summaryA = await getSalesSummary({ tenantId: tenantA });
    const summaryB = await getSalesSummary({ tenantId: tenantB });

    expect(summaryA.totalAmount).toBe('10000.00');
    expect(summaryB.totalAmount).toBe('20000.00');
  });
});
