import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client';
import { tenants } from '../src/db/schema/tenants';
import { orders } from '../src/db/schema/orders';
import { skus } from '../src/db/schema/skus';
import { withTenantTransaction, runWithTenant } from '../src/platform/tenant-context';
import { LotDrizzleRepository } from '../src/modules/catalog-inventory/infrastructure/persistence/lot.drizzle-repository';
import { SkuDrizzleRepository } from '../src/modules/catalog-inventory/infrastructure/persistence/sku.drizzle-repository';
import { OrderDrizzleRepository } from '../src/modules/sales-order/infrastructure/persistence/order.drizzle-repository';
import { OrderService } from '../src/modules/sales-order/application/order.service';
import { TaxRuleDrizzleRepository } from '../src/modules/invoicing-tax/infrastructure/persistence/tax-rule.drizzle-repository';
import { RevenueDrizzleRepository } from '../src/modules/tax-filing/infrastructure/persistence/revenue.drizzle-repository';
import { RateGroupDrizzleRepository } from '../src/modules/tax-filing/infrastructure/persistence/rate-group.drizzle-repository';
import { FilingDrizzleRepository } from '../src/modules/tax-filing/infrastructure/persistence/filing.drizzle-repository';
import { TenantService } from '../src/modules/identity-tenant/application/tenant.service';
import { TenantDrizzleRepository } from '../src/modules/identity-tenant/infrastructure/persistence/tenant.drizzle-repository';
import { TenantMemberDrizzleRepository } from '../src/modules/identity-tenant/infrastructure/persistence/tenant-member.drizzle-repository';
import { TaxEstimateService } from '../src/modules/tax-filing/application/tax-estimate.service';
import { FilingService } from '../src/modules/tax-filing/application/filing.service';
import { filingDeadline, quarterWindowUtc } from '../src/modules/tax-filing/domain/filing-period';
import type { TenantIndustry } from '../src/modules/identity-tenant/domain/tenant.types';
import type { RateGroupCode } from '../src/db/schema/rate-groups';

/** Real Postgres, no mocks — same direct-construction skeleton as `invoice-tax.e2e-spec.ts`. */

const lotRepo = new LotDrizzleRepository();
const skuRepo = new SkuDrizzleRepository();
const orderRepo = new OrderDrizzleRepository();
const orderService = new OrderService(orderRepo, lotRepo, skuRepo);

const tenantService = new TenantService(new TenantDrizzleRepository(), new TenantMemberDrizzleRepository());
const taxEstimateService = new TaxEstimateService(new RevenueDrizzleRepository(), new RateGroupDrizzleRepository(), new FilingDrizzleRepository(), new TaxRuleDrizzleRepository(), tenantService);
const filingService = new FilingService(new FilingDrizzleRepository());

let counter = 0;

async function seedTenant(legalName: string, industry: TenantIndustry, taxGroupDefault?: RateGroupCode): Promise<string> {
  const [tenant] = await db.insert(tenants).values({ legalName, industry, taxGroupDefault: taxGroupDefault ?? null }).returning();
  return tenant!.id;
}

/** Places a real confirmed order, then backdates its `createdAt` to a deterministic instant — so revenue-window tests never depend on when the suite happens to run. */
async function placeBackdatedOrder(tenantId: string, subtotal: string, createdAt: Date) {
  counter += 1;
  const sku = await withTenantTransaction(db, tenantId, async (tx) => {
    const rows = await tx.insert(skus).values({ tenantId, skuCode: `SKU-TAXFILING-${Date.now()}-${counter}`, name: 'Tax filing test item', unit: 'cai', unitPrice: subtotal }).returning();
    return rows[0]!;
  });
  const lot = await lotRepo.receive(tenantId, { skuId: sku.id, lotCode: `LOT-TAXFILING-${Date.now()}-${counter}`, quantity: '1' });
  const order = await runWithTenant(tenantId, () =>
    orderService.placeOrder(tenantId, `tax-filing-test-key-${Date.now()}-${counter}`, {
      channel: 'counter',
      lines: [{ skuId: sku.id, lotId: lot.id, quantity: '1', unitPrice: subtotal }],
    }),
  );
  await withTenantTransaction(db, tenantId, (tx) => tx.update(orders).set({ createdAt }).where(eq(orders.id, order.id)));
  return order;
}

// A fixed Q2/2031 test quarter — far enough in the future that no other
// test's real "now"-timestamped data can ever land in this window.
const TEST_QUARTER = 2;
const TEST_YEAR = 2031;
const { start: quarterStart } = quarterWindowUtc(TEST_QUARTER, TEST_YEAR);
const midQuarter = new Date(quarterStart.getTime() + 10 * 24 * 60 * 60 * 1000); // 10 days into the quarter

describe('Tax/filing v1 — quarterly HKD estimate (real Postgres, no mocks)', () => {
  it('applies the rate group to real order revenue for the quarter', async () => {
    const tenantId = await seedTenant('Tax Filing Test — Rate Group', 'food_beverage', 'sanXuat');
    await placeBackdatedOrder(tenantId, '10000000.00', midQuarter); // 10,000,000 VND — well above 200M/year exemption? No, below — need combined YTD > 200M for real rates to apply

    // A second, larger order pushes year-to-date revenue over the 200M
    // exemption so the rate actually applies (see the exemption test below
    // for the under-200M case).
    await placeBackdatedOrder(tenantId, '250000000.00', midQuarter);

    const estimate = await runWithTenant(tenantId, () => taxEstimateService.estimateQuarter(tenantId, TEST_QUARTER, TEST_YEAR));

    expect(estimate.revenue).toBe('260000000.00');
    expect(estimate.isExempt).toBe(false);
    expect(estimate.rateGroup?.code).toBe('sanXuat');
    // sanXuat: gtgt 0.0300, tncn 0.0150 — 260,000,000 * 0.03 = 7,800,000; * 0.015 = 3,900,000
    expect(estimate.gtgt).toBe('7800000.00');
    expect(estimate.tncn).toBe('3900000.00');
    expect(estimate.total).toBe('11700000.00');
    expect(estimate.isFiled).toBe(false);
  });

  it('zeroes GTGT/TNCN under the 200M/year exemption threshold', async () => {
    const tenantId = await seedTenant('Tax Filing Test — Exempt', 'food_beverage', 'khac');
    await placeBackdatedOrder(tenantId, '150000000.00', midQuarter); // 150M < 200M

    const estimate = await runWithTenant(tenantId, () => taxEstimateService.estimateQuarter(tenantId, TEST_QUARTER, TEST_YEAR));

    expect(estimate.revenue).toBe('150000000.00');
    expect(estimate.isExempt).toBe(true);
    expect(estimate.gtgt).toBe('0.00');
    expect(estimate.tncn).toBe('0.00');
    expect(estimate.total).toBe('0.00');
  });

  it('returns a clear "not configured" result — never a guessed rate group — when the tenant has none set', async () => {
    const tenantId = await seedTenant('Tax Filing Test — Unconfigured', 'agriculture');
    await placeBackdatedOrder(tenantId, '300000000.00', midQuarter);

    const estimate = await runWithTenant(tenantId, () => taxEstimateService.estimateQuarter(tenantId, TEST_QUARTER, TEST_YEAR));

    expect(estimate.rateGroup).toBeNull();
    expect(estimate.gtgt).toBe('0.00');
    expect(estimate.tncn).toBe('0.00');
  });

  it('rejects filing the same quarter twice — a DB-level guarantee, not an app-level check', async () => {
    const tenantId = await seedTenant('Tax Filing Test — Duplicate Filing', 'tourism', 'dichVu');

    await runWithTenant(tenantId, () => filingService.recordFiling(tenantId, TEST_QUARTER, TEST_YEAR, 'RECEIPT-ABC-123', `filing-test-key-a-${Date.now()}`));
    await expect(
      runWithTenant(tenantId, () => filingService.recordFiling(tenantId, TEST_QUARTER, TEST_YEAR, 'RECEIPT-XYZ-999', `filing-test-key-b-${Date.now()}`)),
    ).rejects.toThrow();

    const estimate = await runWithTenant(tenantId, () => taxEstimateService.estimateQuarter(tenantId, TEST_QUARTER, TEST_YEAR));
    expect(estimate.isFiled).toBe(true);
  });

  it('a retry with the SAME idempotency key replays the cached filing instead of erroring', async () => {
    const tenantId = await seedTenant('Tax Filing Test — Idempotent Retry', 'tourism', 'dichVu');
    const key = `filing-test-retry-key-${Date.now()}`;

    const first = await runWithTenant(tenantId, () => filingService.recordFiling(tenantId, TEST_QUARTER, TEST_YEAR, 'RECEIPT-RETRY-1', key));
    const retried = await runWithTenant(tenantId, () => filingService.recordFiling(tenantId, TEST_QUARTER, TEST_YEAR, 'RECEIPT-RETRY-1', key));

    expect(retried.id).toBe(first.id);
    const all = await runWithTenant(tenantId, () => filingService.listFilings(tenantId));
    expect(all.filter((f) => f.quarter === TEST_QUARTER && f.year === TEST_YEAR)).toHaveLength(1);
  });
});

describe('filingDeadline — "last calendar day of the first month of the next quarter" (mockup rule, ported verbatim)', () => {
  it('Q1 deadline is April 30', () => {
    expect(filingDeadline(1, 2026).toISOString().slice(0, 10)).toBe('2026-04-30');
  });
  it('Q2 deadline is July 31', () => {
    expect(filingDeadline(2, 2026).toISOString().slice(0, 10)).toBe('2026-07-31');
  });
  it('Q3 deadline is October 31', () => {
    expect(filingDeadline(3, 2026).toISOString().slice(0, 10)).toBe('2026-10-31');
  });
  it('Q4 wraps to next-year January 31', () => {
    expect(filingDeadline(4, 2026).toISOString().slice(0, 10)).toBe('2027-01-31');
  });
});
