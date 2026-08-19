import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../../platform/auth/public.decorator';
import { SkipTenantContext } from '../../../platform/skip-tenant-context.decorator';
import { InternalServiceGuard } from '../../../platform/internal-service.guard';
import { runWithTenant } from '../../../platform/tenant-context';
import { PaymentService } from '../application/payment.service';
import { RecordPaymentByInvoiceNumberDto } from './internal-payment.dto';
import { PaymentResponseDto } from './payment.dto';
import type { Payment } from '../domain/payment.types';

function toDto(p: Payment): PaymentResponseDto {
  return { id: p.id, invoiceId: p.invoiceId, method: p.method, amount: p.amount, referenceCode: p.referenceCode, receivedAt: p.receivedAt };
}

/**
 * Service-to-service only — `connector-hub`'s SePay webhook forwards a
 * verified, deduped payment event here once it extracts an invoice number
 * from the bank transfer's content. `@Public()` skips the per-user JWT
 * guard, `@SkipTenantContext()` skips the tenant interceptor (no
 * `request.user.contextId` exists for a machine caller), `InternalServiceGuard`
 * is what actually authenticates this route instead. Never exposed in the
 * Swagger doc (`@ApiExcludeController`) — it isn't a public API surface,
 * even though it happens to be reachable at the same base URL.
 */
@ApiExcludeController()
@Controller('internal/payments')
@UseGuards(InternalServiceGuard)
export class InternalPaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('by-invoice-number')
  @Public()
  @SkipTenantContext()
  async recordByInvoiceNumber(@Body() dto: RecordPaymentByInvoiceNumberDto): Promise<PaymentResponseDto> {
    const payment = await runWithTenant(dto.tenantId, () =>
      this.paymentService.recordPaymentByInvoiceNumber(dto.tenantId, dto.invoiceNumber, {
        method: dto.method,
        amount: dto.amount,
        ...(dto.referenceCode !== undefined ? { referenceCode: dto.referenceCode } : {}),
      }),
    );
    return toDto(payment);
  }
}
