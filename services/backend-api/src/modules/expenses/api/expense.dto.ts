import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsIn, IsNumberString, IsOptional, IsString, MinLength } from 'class-validator';

const EXPENSE_CATEGORIES = ['bao-bi', 'van-chuyen', 'dien-nuoc', 'mat-bang', 'nhan-cong', 'thiet-bi', 'nguyen-lieu', 'khac'] as const;
const EXPENSE_DOCUMENTATION = ['hoa-don', 'phieu-chi', 'khong'] as const;

export class CreateExpenseDto {
  @ApiProperty({ enum: EXPENSE_CATEGORIES }) @IsIn(EXPENSE_CATEGORIES) category!: (typeof EXPENSE_CATEGORIES)[number];
  @ApiProperty() @IsString() @MinLength(1) description!: string;
  @ApiProperty() @IsNumberString() amount!: string;
  @ApiProperty({ required: false, enum: EXPENSE_DOCUMENTATION, description: 'Defaults to "khong" (no documentation) — never invented, an absent receipt is a real, common state' })
  @IsOptional()
  @IsIn(EXPENSE_DOCUMENTATION)
  documentation?: (typeof EXPENSE_DOCUMENTATION)[number];
  @ApiProperty({ required: false, description: 'Free text — not an FK to procurement\'s Supplier entity, matching the mockup\'s own data model' })
  @IsOptional()
  @IsString()
  supplierName?: string;
  @ApiProperty({ required: false, default: false }) @IsOptional() @IsBoolean() isPersonalWallet?: boolean;
  @ApiProperty({ required: false, description: 'Defaults to now — when the spend happened, not when it was recorded' }) @IsOptional() @IsDateString() spentAt?: string;
}

export class ListExpensesQueryDto {
  @ApiProperty({ required: false, description: 'Inclusive lower bound on spentAt (ISO 8601)' }) @IsOptional() @IsDateString() from?: string;
  @ApiProperty({ required: false, description: 'Exclusive upper bound on spentAt (ISO 8601)' }) @IsOptional() @IsDateString() to?: string;
}

export class ExpenseResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: EXPENSE_CATEGORIES }) category!: string;
  @ApiProperty() description!: string;
  @ApiProperty() amount!: string;
  @ApiProperty({ enum: EXPENSE_DOCUMENTATION }) documentation!: string;
  @ApiProperty({ nullable: true }) supplierName!: string | null;
  @ApiProperty() isPersonalWallet!: boolean;
  @ApiProperty() spentAt!: string;
  @ApiProperty() createdAt!: string;
}

export class ExpenseCategoryTotalDto {
  @ApiProperty() category!: string;
  @ApiProperty() total!: string;
  @ApiProperty() count!: number;
}

export class ExpenseSummaryResponseDto {
  @ApiProperty() total!: string;
  @ApiProperty() count!: number;
  @ApiProperty({ type: [ExpenseCategoryTotalDto] }) byCategory!: ExpenseCategoryTotalDto[];
  @ApiProperty() noDocumentationTotal!: string;
  @ApiProperty() personalWalletTotal!: string;
}
