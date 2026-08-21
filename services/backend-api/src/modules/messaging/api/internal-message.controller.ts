import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Public } from '../../../platform/auth/public.decorator';
import { SkipTenantContext } from '../../../platform/skip-tenant-context.decorator';
import { InternalServiceGuard } from '../../../platform/internal-service.guard';
import { runWithTenant } from '../../../platform/tenant-context';
import { MessageService } from '../application/message.service';
import { MessageResponseDto } from './message.dto';
import type { Message } from '../domain/message.types';

export class InboundMessageDto {
  @ApiProperty() @IsUUID() tenantId!: string;
  @ApiProperty({ enum: ['zalo'] }) @IsIn(['zalo']) channel!: 'zalo';
  @ApiProperty() @IsString() @MinLength(1) customerName!: string;
  @ApiProperty() @IsString() @MinLength(1) content!: string;
  @ApiProperty() @IsString() @MinLength(1) sourceEventId!: string;
  @ApiProperty() @IsISO8601() occurredAt!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() senderId!: string | undefined;
}

function toDto(m: Message): MessageResponseDto {
  return {
    id: m.id,
    channel: m.channel,
    direction: m.direction,
    customerName: m.customerName,
    content: m.content,
    reply: m.reply,
    repliedAt: m.repliedAt,
    occurredAt: m.occurredAt,
    createdAt: m.createdAt,
  };
}

/**
 * Service-to-service only — `connector-hub`'s Zalo webhook forwards a
 * verified, deduped inbound customer message here. `@Public()` skips the
 * per-user JWT guard, `@SkipTenantContext()` skips the tenant interceptor
 * (no `request.user.contextId` for a machine caller), `InternalServiceGuard`
 * authenticates instead. Same shape as `InternalPaymentController`, minus
 * the Swagger exposure. A redelivered event returns the stored message with
 * `deduplicated: true` — never an error, so webhook redelivery can't fail
 * forever on an already-ingested event.
 */
@ApiExcludeController()
@Controller('internal/messages')
@UseGuards(InternalServiceGuard)
export class InternalMessageController {
  constructor(private readonly messageService: MessageService) {}

  @Post('inbound')
  @Public()
  @SkipTenantContext()
  async recordInbound(@Body() dto: InboundMessageDto): Promise<{ message: MessageResponseDto | null; deduplicated: boolean }> {
    const message = await runWithTenant(dto.tenantId, () =>
      this.messageService.recordInbound(dto.tenantId, {
        channel: dto.channel,
        customerName: dto.customerName,
        content: dto.content,
        sourceEventId: dto.sourceEventId,
        occurredAt: new Date(dto.occurredAt),
      }),
    );
    return { message: message ? toDto(message) : null, deduplicated: message === null };
  }
}
