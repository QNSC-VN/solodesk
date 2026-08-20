import { describe, it, expect } from 'vitest';
import { db } from '../src/db/client';
import { tenants } from '../src/db/schema/tenants';
import { runWithTenant } from '../src/platform/tenant-context';
import { ExpenseDrizzleRepository } from '../src/modules/expenses/infrastructure/persistence/expense.drizzle-repository';
import { ExpenseService } from '../src/modules/expenses/application/expense.service';

/** Real Postgres, no mocks. Non-inventory operating spend — the mockup's own "Khoản chi". */

const expenseService = new ExpenseService(new ExpenseDrizzleRepository());

async function seedTenant(legalName: string): Promise<string> {
  const [tenant] = await db.insert(tenants).values({ legalName, industry: 'food_beverage' }).returning();
  return tenant!.id;
}

describe('Expenses (real Postgres, no mocks)', () => {
  it('records a real expense with defaults (documentation "khong", isPersonalWallet false)', async () => {
    const tenantId = await seedTenant('Expense Test — Defaults');
    const key = `expense-test-key-${Date.now()}`;

    const expense = await runWithTenant(tenantId, () => expenseService.recordExpense(tenantId, key, { category: 'bao-bi', description: 'Túi giấy đóng gói', amount: '150000.00' }));

    expect(expense.documentation).toBe('khong');
    expect(expense.isPersonalWallet).toBe(false);
    expect(expense.supplierName).toBeNull();
    expect(expense.amount).toBe('150000.00');
  });

  it('a retry with the SAME idempotency key replays the cached expense instead of double-recording', async () => {
    const tenantId = await seedTenant('Expense Test — Idempotent Retry');
    const key = `expense-test-retry-key-${Date.now()}`;

    const first = await runWithTenant(tenantId, () => expenseService.recordExpense(tenantId, key, { category: 'van-chuyen', description: 'Xăng xe giao hàng', amount: '80000.00' }));
    const retried = await runWithTenant(tenantId, () => expenseService.recordExpense(tenantId, key, { category: 'van-chuyen', description: 'Xăng xe giao hàng', amount: '80000.00' }));

    expect(retried.id).toBe(first.id);
    const all = await runWithTenant(tenantId, () => expenseService.listExpenses(tenantId));
    expect(all).toHaveLength(1);
  });

  it('rejects a non-positive amount', async () => {
    const tenantId = await seedTenant('Expense Test — Non-positive Amount');
    await expect(
      runWithTenant(tenantId, () => expenseService.recordExpense(tenantId, `expense-test-key-neg-${Date.now()}`, { category: 'khac', description: 'Invalid', amount: '0.00' })),
    ).rejects.toThrow();
  });

  it('summary computes total/count/category breakdown and the two real compliance flags', async () => {
    const tenantId = await seedTenant('Expense Test — Summary');
    const now = new Date();
    await runWithTenant(tenantId, () =>
      expenseService.recordExpense(tenantId, `expense-test-key-a-${Date.now()}`, {
        category: 'dien-nuoc',
        description: 'Tiền điện tháng này',
        amount: '500000.00',
        documentation: 'hoa-don',
        spentAt: now,
      }),
    );
    await runWithTenant(tenantId, () =>
      expenseService.recordExpense(tenantId, `expense-test-key-b-${Date.now()}`, {
        category: 'nhan-cong',
        description: 'Trả công thợ',
        amount: '300000.00',
        isPersonalWallet: true,
        spentAt: now,
      }),
    );
    await runWithTenant(tenantId, () =>
      expenseService.recordExpense(tenantId, `expense-test-key-c-${Date.now()}`, {
        category: 'dien-nuoc',
        description: 'Tiền nước tháng này',
        amount: '100000.00',
        spentAt: now,
      }),
    );

    const summary = await runWithTenant(tenantId, () => expenseService.getSummary(tenantId, { from: new Date(now.getTime() - 60_000), to: new Date(now.getTime() + 60_000) }));

    expect(summary.total).toBe('900000.00');
    expect(summary.count).toBe(3);
    const dienNuoc = summary.byCategory.find((c) => c.category === 'dien-nuoc');
    expect(dienNuoc?.total).toBe('600000.00');
    expect(dienNuoc?.count).toBe(2);
    // Only the 100,000 water bill has no documentation (default 'khong'); the electricity one has 'hoa-don'.
    expect(summary.noDocumentationTotal).toBe('400000.00');
    // Only the labor expense was flagged personal-wallet.
    expect(summary.personalWalletTotal).toBe('300000.00');
  });

  it('list filters by an explicit from/to window', async () => {
    const tenantId = await seedTenant('Expense Test — Date Filter');
    const inWindow = new Date('2026-03-15T00:00:00Z');
    const outOfWindow = new Date('2026-01-01T00:00:00Z');

    await runWithTenant(tenantId, () =>
      expenseService.recordExpense(tenantId, `expense-test-key-in-${Date.now()}`, { category: 'khac', description: 'In window', amount: '1000.00', spentAt: inWindow }),
    );
    await runWithTenant(tenantId, () =>
      expenseService.recordExpense(tenantId, `expense-test-key-out-${Date.now()}`, { category: 'khac', description: 'Out of window', amount: '2000.00', spentAt: outOfWindow }),
    );

    const filtered = await runWithTenant(tenantId, () => expenseService.listExpenses(tenantId, { from: new Date('2026-03-01T00:00:00Z'), to: new Date('2026-04-01T00:00:00Z') }));
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.description).toBe('In window');
  });
});
