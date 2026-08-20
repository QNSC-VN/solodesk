import { BadRequestException, Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { getCurrentTenantId } from '../../../platform/tenant-context';
import { ExpenseService } from '../application/expense.service';
import { CreateExpenseDto, ListExpensesQueryDto, ExpenseResponseDto, ExpenseSummaryResponseDto } from './expense.dto';
import type { Expense } from '../domain/expense.types';

function toDto(e: Expense): ExpenseResponseDto {
  return {
    id: e.id,
    category: e.category,
    description: e.description,
    amount: e.amount,
    documentation: e.documentation,
    supplierName: e.supplierName,
    isPersonalWallet: e.isPersonalWallet,
    spentAt: e.spentAt.toISOString(),
    createdAt: e.createdAt.toISOString(),
  };
}

/** Non-inventory operating spend — the mockup's own "Khoản chi" (see `domain/expense.types.ts`'s doc comment for why this is genuinely separate from procurement's purchase notes). No `tenantId` param — every route scoped to the caller's own tenant. */
@ApiTags('expenses')
@Controller('expenses')
export class ExpenseController {
  constructor(private readonly expenseService: ExpenseService) {}

  @Post()
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'A dropped connection + client retry replays the cached expense instead of double-recording' })
  @ApiOperation({ summary: 'Record a real operating expense' })
  async create(@Body() dto: CreateExpenseDto, @Headers('idempotency-key') idempotencyKey?: string): Promise<ExpenseResponseDto> {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required.');
    }
    const expense = await this.expenseService.recordExpense(getCurrentTenantId(), idempotencyKey, {
      category: dto.category,
      description: dto.description,
      amount: dto.amount,
      ...(dto.documentation !== undefined ? { documentation: dto.documentation } : {}),
      ...(dto.supplierName !== undefined ? { supplierName: dto.supplierName } : {}),
      ...(dto.isPersonalWallet !== undefined ? { isPersonalWallet: dto.isPersonalWallet } : {}),
      ...(dto.spentAt !== undefined ? { spentAt: new Date(dto.spentAt) } : {}),
    });
    return toDto(expense);
  }

  @Get()
  @ApiOperation({ summary: "List the caller's tenant expenses, most recent first" })
  async list(@Query() query: ListExpensesQueryDto): Promise<ExpenseResponseDto[]> {
    const expenses = await this.expenseService.listExpenses(getCurrentTenantId(), {
      ...(query.from !== undefined ? { from: new Date(query.from) } : {}),
      ...(query.to !== undefined ? { to: new Date(query.to) } : {}),
    });
    return expenses.map(toDto);
  }

  @Get('summary')
  @ApiOperation({ summary: "Spend total/count/category breakdown + compliance flags (no-documentation and personal-wallet totals) — defaults to the current calendar month" })
  async summary(@Query() query: ListExpensesQueryDto): Promise<ExpenseSummaryResponseDto> {
    return this.expenseService.getSummary(getCurrentTenantId(), {
      ...(query.from !== undefined ? { from: new Date(query.from) } : {}),
      ...(query.to !== undefined ? { to: new Date(query.to) } : {}),
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one expense by id' })
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<ExpenseResponseDto> {
    const expense = await this.expenseService.getExpense(id, getCurrentTenantId());
    return toDto(expense);
  }
}
