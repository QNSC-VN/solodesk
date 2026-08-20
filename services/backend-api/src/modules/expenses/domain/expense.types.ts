import type { ExpenseCategory, ExpenseDocumentation } from '../../../db/schema/expenses';

export type { ExpenseCategory, ExpenseDocumentation };

export interface Expense {
  id: string;
  tenantId: string;
  category: ExpenseCategory;
  description: string;
  amount: string;
  documentation: ExpenseDocumentation;
  supplierName: string | null;
  isPersonalWallet: boolean;
  spentAt: Date;
  createdAt: Date;
}

export interface CreateExpenseInput {
  category: ExpenseCategory;
  description: string;
  amount: string;
  documentation?: ExpenseDocumentation;
  supplierName?: string;
  isPersonalWallet?: boolean;
  spentAt?: Date;
}

export interface ExpenseFilters {
  from?: Date;
  to?: Date;
}

/** The mockup's own `chiSummary()` — total/count, a per-category breakdown, and two real compliance flags: undocumented spend (won't be deductible once formalized) and personal-wallet spend (a bookkeeping-hygiene warning, never blocking). */
export interface ExpenseSummary {
  total: string;
  count: number;
  byCategory: { category: ExpenseCategory; total: string; count: number }[];
  noDocumentationTotal: string;
  personalWalletTotal: string;
}
