import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNumberString, IsOptional, IsString, IsUUID } from 'class-validator';

const PAYMENT_METHODS = ['cash', 'bank_transfer', 'qr', 'marketplace_settlement'] as const;

/**
 * No `@IsUUID()`-only invoice reference here — the caller (connector-hub)
 * only has the human-readable invoice number from a bank-transfer content/
 * QR note, never the internal id. `tenantId` is explicit in the body
 * because this route has no per-user JWT session to derive it from (see
 * `InternalServiceGuard`'s header comment).
 */
export class RecordPaymentByInvoiceNumberDto {
  @ApiProperty() @IsUUID() tenantId!: string;
  @ApiProperty({ example: 'INV-2026-000001' }) @IsString() invoiceNumber!: string;

  @ApiProperty({ enum: PAYMENT_METHODS })
  @IsIn(PAYMENT_METHODS)
  method!: (typeof PAYMENT_METHODS)[number];

  @ApiProperty() @IsNumberString() amount!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  referenceCode?: string;
}
