import { Inject, Injectable } from '@nestjs/common';
import { NotFoundException } from '@qnsc-vn/platform-http';
import { db } from '../../../db/client';
import { assertTenantMatchesSession, withTenantTransaction } from '../../../platform/tenant-context';
import { withIdempotency } from '../../../platform/idempotency';
import { monthWindowUtc } from '../../../platform/vn-time';
import { sumMoney } from '../../../platform/money';
import { EXPENSE_REPOSITORY, type IExpenseRepository } from '../domain/ports/expense.repository';
import type { Expense, CreateExpenseInput, ExpenseFilters, ExpenseSummary, ExpenseCategory } from '../domain/expense.types';

@Injectable()
export class ExpenseService {
  constructor(@Inject(EXPENSE_REPOSITORY) private readonly expenseRepository: IExpenseRepository) {}

  async recordExpense(tenantId: string, idempotencyKey: string, input: CreateExpenseInput): Promise<Expense> {
    assertTenantMatchesSession(tenantId);
    return withTenantTransaction(db, tenantId, (tx) => withIdempotency(tx, tenantId, idempotencyKey, () => this.expenseRepository.create(tenantId, input, tx)));
  }

  async listExpenses(tenantId: string, filters?: ExpenseFilters): Promise<Expense[]> {
    assertTenantMatchesSession(tenantId);
    return this.expenseRepository.listByTenant(tenantId, filters);
  }

  async getExpense(id: string, tenantId: string): Promise<Expense> {
    assertTenantMatchesSession(tenantId);
    const expense = await this.expenseRepository.getById(id, tenantId);
    if (!expense) {
      throw new NotFoundException('EXPENSE_NOT_FOUND', `Expense ${id} not found`);
    }
    return expense;
  }

  /**
   * The mockup's own `chiSummary()` — computed in-app over the real
   * filtered list (this tenant's own expense volume is small, no need for
   * a separate SQL aggregation query the way `customers`/`tax-filing`
   * need one over much larger order tables). Defaults to the current
   * calendar month (Asia/Ho_Chi_Minh, fixed UTC+7) when no explicit
   * `from`/`to` is given — an unbounded all-time total is a less useful
   * default for a spend summary than one matching how the mockup's own
   * period-scoped screens work.
   */
  async getSummary(tenantId: string, filters?: ExpenseFilters): Promise<ExpenseSummary> {
    assertTenantMatchesSession(tenantId);
    const effectiveFilters = filters?.from !== undefined || filters?.to !== undefined ? filters : currentMonthWindow();
    const list = await this.expenseRepository.listByTenant(tenantId, effectiveFilters);

    const byCategory = new Map<ExpenseCategory, Expense[]>();
    for (const expense of list) {
      byCategory.set(expense.category, [...(byCategory.get(expense.category) ?? []), expense]);
    }

    return {
      total: sumMoney(list.map((e) => e.amount)),
      count: list.length,
      byCategory: [...byCategory.entries()].map(([category, items]) => ({ category, total: sumMoney(items.map((e) => e.amount)), count: items.length })),
      noDocumentationTotal: sumMoney(list.filter((e) => e.documentation === 'khong').map((e) => e.amount)),
      personalWalletTotal: sumMoney(list.filter((e) => e.isPersonalWallet).map((e) => e.amount)),
    };
  }
}

/** The VN-local month window comes from `platform/vn-time.ts` — the one home for UTC+7 boundary math. */
function currentMonthWindow(): ExpenseFilters {
  const { start, end } = monthWindowUtc(new Date());
  return { from: start, to: end };
}
