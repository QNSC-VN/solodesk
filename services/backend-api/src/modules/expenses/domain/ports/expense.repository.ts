import type { Db } from '../../../../db/client';
import type { Expense, CreateExpenseInput, ExpenseFilters } from '../expense.types';

export const EXPENSE_REPOSITORY = Symbol('EXPENSE_REPOSITORY');

export interface IExpenseRepository {
  create(tenantId: string, input: CreateExpenseInput, tx: Db): Promise<Expense>;
  listByTenant(tenantId: string, filters?: ExpenseFilters): Promise<Expense[]>;
  getById(id: string, tenantId: string): Promise<Expense | null>;
}
