import { Module } from '@nestjs/common';
import { ExpenseService } from './application/expense.service';
import { ExpenseController } from './api/expense.controller';
import { ExpenseDrizzleRepository } from './infrastructure/persistence/expense.drizzle-repository';
import { EXPENSE_REPOSITORY } from './domain/ports/expense.repository';

@Module({
  controllers: [ExpenseController],
  providers: [ExpenseService, { provide: EXPENSE_REPOSITORY, useClass: ExpenseDrizzleRepository }],
})
export class ExpensesModule {}
