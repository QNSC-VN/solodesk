import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class IssueInvoiceDto {
  @ApiProperty() @IsUUID() orderId!: string;
}

export class InvoiceResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() orderId!: string;
  @ApiProperty() invoiceNumber!: string;
  @ApiProperty() subtotal!: string;
  @ApiProperty() taxRate!: string;
  @ApiProperty() taxAmount!: string;
  @ApiProperty() totalAmount!: string;
  @ApiProperty() requiresEInvoice!: boolean;
  @ApiProperty() status!: string;
  @ApiProperty() issuedAt!: Date;
}
