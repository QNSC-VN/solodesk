import { BadRequestException, Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { getCurrentTenantId } from '../../../platform/tenant-context';
import { ReturnService } from '../application/return.service';
import { CreateReturnDto, ReturnResponseDto } from './return.dto';
import type { Return } from '../domain/return.types';

function toDto(r: Return): ReturnResponseDto {
  return {
    id: r.id,
    orderId: r.orderId,
    invoiceId: r.invoiceId,
    reason: r.reason,
    refundAmount: r.refundAmount,
    refundMethod: r.refundMethod,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  };
}

@ApiTags('returns')
@Controller('returns')
export class ReturnController {
  constructor(private readonly returnService: ReturnService) {}

  @Post()
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Required — prevents a client retry from crediting stock or refunding twice' })
  @ApiOperation({ summary: 'Return a full, already-invoiced order — reverses stock, invoice, and any paid amount' })
  async create(@Body() dto: CreateReturnDto, @Headers('idempotency-key') idempotencyKey?: string): Promise<ReturnResponseDto> {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required.');
    }
    const created = await this.returnService.returnOrder(getCurrentTenantId(), idempotencyKey, dto);
    return toDto(created);
  }

  @Get()
  @ApiOperation({ summary: "List the caller's tenant returns" })
  async list(): Promise<ReturnResponseDto[]> {
    const list = await this.returnService.listReturns(getCurrentTenantId());
    return list.map(toDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a return by id' })
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<ReturnResponseDto> {
    const found = await this.returnService.getReturn(id, getCurrentTenantId());
    return toDto(found);
  }
}
