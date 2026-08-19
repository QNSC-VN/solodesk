import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNumberString, IsOptional, IsString, IsUUID } from 'class-validator';

const PAYMENT_METHODS = ['cash', 'bank_transfer', 'qr', 'marketplace_settlement'] as const;

export class RecordPaymentDto {
  @ApiProperty() @IsUUID() invoiceId!: string;

  @ApiProperty({ enum: PAYMENT_METHODS })
  @IsIn(PAYMENT_METHODS)
  method!: (typeof PAYMENT_METHODS)[number];

  @ApiProperty() @IsNumberString() amount!: string;

  @ApiProperty({ required: false, description: 'Bank/QR/marketplace-settlement transaction id — omitted for cash' })
  @IsOptional()
  @IsString()
  referenceCode?: string;
}

export class PaymentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() invoiceId!: string;
  @ApiProperty() method!: string;
  @ApiProperty() amount!: string;
  @ApiProperty({ enum: ['payment', 'refund'] }) type!: string;
  @ApiProperty({ nullable: true }) referenceCode!: string | null;
  @ApiProperty() receivedAt!: Date;
}

export class PaymentSummaryResponseDto {
  @ApiProperty() invoiceId!: string;
  @ApiProperty() totalAmount!: string;
  @ApiProperty() paidAmount!: string;
  @ApiProperty() outstandingAmount!: string;
  @ApiProperty() isFullyPaid!: boolean;
}
