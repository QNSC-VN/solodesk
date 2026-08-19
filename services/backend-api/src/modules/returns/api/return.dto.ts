import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

const REFUND_METHODS = ['cash', 'bank_transfer', 'qr', 'marketplace_settlement'] as const;

export class CreateReturnDto {
  @ApiProperty() @IsUUID() orderId!: string;
  @ApiProperty() @IsString() reason!: string;

  @ApiProperty({ required: false, enum: REFUND_METHODS, description: 'Required when the invoice has a paid amount to refund back' })
  @IsOptional()
  @IsIn(REFUND_METHODS)
  refundMethod?: (typeof REFUND_METHODS)[number];
}

export class ReturnResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() orderId!: string;
  @ApiProperty() invoiceId!: string;
  @ApiProperty() reason!: string;
  @ApiProperty() refundAmount!: string;
  @ApiProperty({ nullable: true }) refundMethod!: string | null;
  @ApiProperty() status!: string;
  @ApiProperty() createdAt!: string;
}
