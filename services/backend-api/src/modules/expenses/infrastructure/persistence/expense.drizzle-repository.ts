import { Injectable } from '@nestjs/common';
import { eq, and, gte, lt, desc } from 'drizzle-orm';
import { db, type Db } from '../../../../db/client';
import { expenses } from '../../../../db/schema/expenses';
import { withTenantTransaction } from '../../../../platform/tenant-context';
import type { IExpenseRepository } from '../../domain/ports/expense.repository';
import type { Expense, CreateExpenseInput, ExpenseFilters } from '../../domain/expense.types';

function toDomain(row: typeof expenses.$inferSelect): Expense {
  return {
    id: row.id,
    tenantId: row.tenantId,
    category: row.category,
    description: row.description,
    amount: row.amount,
    documentation: row.documentation,
    supplierName: row.supplierName,
    isPersonalWallet: row.isPersonalWallet,
    spentAt: row.spentAt,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class ExpenseDrizzleRepository implements IExpenseRepository {
  /** Mandatory trailing `tx` — must run in the same transaction as the caller's `withIdempotency` key-insert, same convention as `InvoiceDrizzleRepository.create`/`FilingDrizzleRepository.create`. */
  async create(tenantId: string, input: CreateExpenseInput, tx: Db): Promise<Expense> {
    const rows = await tx
      .insert(expenses)
      .values({
        tenantId,
        category: input.category,
        description: input.description,
        amount: input.amount,
        ...(input.documentation !== undefined ? { documentation: input.documentation } : {}),
        ...(input.supplierName !== undefined ? { supplierName: input.supplierName } : {}),
        ...(input.isPersonalWallet !== undefined ? { isPersonalWallet: input.isPersonalWallet } : {}),
        ...(input.spentAt !== undefined ? { spentAt: input.spentAt } : {}),
      })
      .returning();
    return toDomain(rows[0]!);
  }

  async listByTenant(tenantId: string, filters?: ExpenseFilters): Promise<Expense[]> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(expenses)
        .where(
          and(
            eq(expenses.tenantId, tenantId),
            filters?.from !== undefined ? gte(expenses.spentAt, filters.from) : undefined,
            filters?.to !== undefined ? lt(expenses.spentAt, filters.to) : undefined,
          ),
        )
        .orderBy(desc(expenses.spentAt));
      return rows.map(toDomain);
    });
  }

  async getById(id: string, tenantId: string): Promise<Expense | null> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(expenses)
        .where(and(eq(expenses.id, id), eq(expenses.tenantId, tenantId)))
        .limit(1);
      return rows[0] ? toDomain(rows[0]) : null;
    });
  }
}
