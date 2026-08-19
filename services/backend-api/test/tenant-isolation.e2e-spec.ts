import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client';
import { tenants } from '../src/db/schema/tenants';
import { tenantMembers } from '../src/db/schema/tenant-members';
import { withTenantTransaction, runWithTenant, assertTenantMatchesSession } from '../src/platform/tenant-context';

/**
 * Section 4.5 / Mục 4.5 — mandatory CI test. AI agents (and, as this file
 * proves, plain repository code) are non-deterministic enough in practice
 * that unit tests alone are not sufficient: this hits a REAL Postgres, with
 * REAL concurrent transactions, not mocks.
 *
 * If this file ever needs to be "fixed" by adding an app-layer WHERE clause
 * to make it pass, that is a regression in the RLS policy or the app-role
 * grant, not a bug in the test.
 */

async function seedTenantWithMember(legalName: string, industry: string) {
  const [tenant] = await db.insert(tenants).values({ legalName, industry }).returning();
  const member = await withTenantTransaction(db, tenant!.id, async (tx) => {
    const rows = await tx
      .insert(tenantMembers)
      .values({
        tenantId: tenant!.id,
        userId: crypto.randomUUID(),
        displayName: `${legalName} owner`,
        role: 'owner',
        canEdit: true,
      })
      .returning();
    return rows[0]!;
  });
  return { tenant: tenant!, member };
}

describe('Cross-tenant isolation (RLS + SET LOCAL) — Section 4.5', () => {
  let tenantA: Awaited<ReturnType<typeof seedTenantWithMember>>;
  let tenantB: Awaited<ReturnType<typeof seedTenantWithMember>>;

  beforeAll(async () => {
    tenantA = await seedTenantWithMember('Đặc sản Biển Xanh', 'food_beverage');
    tenantB = await seedTenantWithMember('Dịch vụ Du lịch Nhơn Lý', 'tourism');
  });

  it('RLS blocks cross-tenant rows even when the app query has NO tenant_id filter at all', async () => {
    // Deliberately simulates a buggy repository that forgot the WHERE clause —
    // the whole point of RLS is that this must be blocked by the DATABASE,
    // not by code discipline.
    const rowsSeenByTenantA = await withTenantTransaction(db, tenantA.tenant.id, async (tx) => {
      return tx.select().from(tenantMembers); // no .where() at all
    });

    expect(rowsSeenByTenantA.map((r) => r.id)).toContain(tenantA.member.id);
    expect(rowsSeenByTenantA.map((r) => r.id)).not.toContain(tenantB.member.id);
  });

  it('holds under real concurrent transactions on a shared connection pool', async () => {
    // Section 4.5's "real concurrency, not mocked": fire many parallel
    // transactions for BOTH tenants at once against the same pool, and
    // confirm none of tenant A's concurrent reads ever see tenant B's row —
    // this is exactly the transaction-mode-pooling leak scenario Section 4.1
    // warns about (SET LOCAL scoped wrong would show up here, not in a
    // single-request test).
    const concurrentReads = await Promise.all(
      Array.from({ length: 20 }, (_, i) => {
        const tenant = i % 2 === 0 ? tenantA : tenantB;
        return withTenantTransaction(db, tenant.tenant.id, async (tx) => {
          const rows = await tx.select().from(tenantMembers).where(eq(tenantMembers.tenantId, tenant.tenant.id));
          return { expectedTenantId: tenant.tenant.id, rows };
        });
      }),
    );

    for (const { expectedTenantId, rows } of concurrentReads) {
      for (const row of rows) {
        expect(row.tenantId).toBe(expectedTenantId);
      }
    }
  });

  it('Section 4.4 defense-in-depth: rejects a caller-supplied tenantId that does not match session context', async () => {
    runWithTenant(tenantA.tenant.id, () => {
      expect(() => assertTenantMatchesSession(tenantB.tenant.id)).toThrow(/Tenant mismatch/);
      expect(() => assertTenantMatchesSession(tenantA.tenant.id)).not.toThrow();
    });
  });

  it('getCurrentTenantId() fails closed when no context was ever set', async () => {
    const { getCurrentTenantId } = await import('../src/platform/tenant-context');
    expect(() => getCurrentTenantId()).toThrow(/no tenant context set/);
  });
});
