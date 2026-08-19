import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { getCurrentTenantId } from '../../../platform/tenant-context';
import { PaymentService } from '../application/payment.service';
import { RecordPaymentDto, PaymentResponseDto, PaymentSummaryResponseDto } from './payment.dto';
import type { Payment, PaymentSummary } from '../domain/payment.types';

function toDto(p: Payment): PaymentResponseDto {
  return {
    id: p.id,
    invoiceId: p.invoiceId,
    method: p.method,
    amount: p.amount,
    referenceCode: p.referenceCode,
    receivedAt: p.receivedAt,
  };
}

function toSummaryDto(s: PaymentSummary): PaymentSummaryResponseDto {
  return { invoiceId: s.invoiceId, totalAmount: s.totalAmount, paidAmount: s.paidAmount, outstandingAmount: s.outstandingAmount, isFullyPaid: s.isFullyPaid };
}

@ApiTags('payments')
@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post()
  @ApiOperation({ summary: 'Record a payment (cash, bank transfer, QR, or marketplace settlement) against an invoice' })
  async record(@Body() dto: RecordPaymentDto): Promise<PaymentResponseDto> {
    const payment = await this.paymentService.recordPayment(getCurrentTenantId(), dto);
    return toDto(payment);
  }

  @Get('by-invoice/:invoiceId')
  @ApiOperation({ summary: 'List payments recorded against an invoice' })
  async listByInvoice(@Param('invoiceId', ParseUUIDPipe) invoiceId: string): Promise<PaymentResponseDto[]> {
    const list = await this.paymentService.listPayments(invoiceId, getCurrentTenantId());
    return list.map(toDto);
  }

  @Get('by-invoice/:invoiceId/summary')
  @ApiOperation({ summary: 'Paid/outstanding amount for an invoice, derived from its recorded payments' })
  async summary(@Param('invoiceId', ParseUUIDPipe) invoiceId: string): Promise<PaymentSummaryResponseDto> {
    const summary = await this.paymentService.getPaymentSummary(invoiceId, getCurrentTenantId());
    return toSummaryDto(summary);
  }
}
