import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { getCurrentTenantId } from '../../../platform/tenant-context';
import { Public } from '../../../platform/auth/public.decorator';
import { SkipTenantContext } from '../../../platform/skip-tenant-context.decorator';
import { TraceabilityService } from '../application/traceability.service';
import { LotTraceResponseDto } from './trace.dto';
import type { LotTrace } from '../domain/trace.types';

function toDto(t: LotTrace): LotTraceResponseDto {
  return {
    lotId: t.lotId,
    skuName: t.skuName,
    skuCategory: t.skuCategory,
    lotCode: t.lotCode,
    sourceChannel: t.sourceChannel,
    supplierName: t.supplierName,
    receivedAt: t.receivedAt,
    publishedAt: t.publishedAt,
  };
}

@ApiTags('trace')
@Controller('trace')
export class TraceController {
  constructor(private readonly traceabilityService: TraceabilityService) {}

  @Post(':lotId/publish')
  @ApiOperation({ summary: 'Publish a lot for public QR traceability — authenticated, verifies tenant owns the lot' })
  async publish(@Param('lotId', ParseUUIDPipe) lotId: string): Promise<LotTraceResponseDto> {
    const trace = await this.traceabilityService.publishLotTrace(getCurrentTenantId(), lotId);
    return toDto(trace);
  }

  @Get(':lotId')
  @Public()
  @SkipTenantContext()
  @ApiOperation({ summary: 'Public, unauthenticated lot trace — the page a buyer reaches by scanning a QR code' })
  async getPublic(@Param('lotId', ParseUUIDPipe) lotId: string): Promise<LotTraceResponseDto> {
    const trace = await this.traceabilityService.getPublicTrace(lotId);
    return toDto(trace);
  }
}
