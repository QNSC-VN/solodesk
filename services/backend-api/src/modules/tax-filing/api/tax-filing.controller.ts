import { BadRequestException, Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { getCurrentTenantId } from '../../../platform/tenant-context';
import { TaxEstimateService } from '../application/tax-estimate.service';
import { FilingService } from '../application/filing.service';
import { GetEstimateQueryDto, CreateFilingDto, TaxEstimateResponseDto, FilingResponseDto } from './tax-filing.dto';
import type { TaxEstimate, Filing } from '../domain/tax-filing.types';

function toEstimateDto(e: TaxEstimate): TaxEstimateResponseDto {
  return {
    quarter: e.quarter,
    year: e.year,
    revenue: e.revenue,
    isExempt: e.isExempt,
    gtgt: e.gtgt,
    tncn: e.tncn,
    total: e.total,
    rateGroup: e.rateGroup,
    filingDeadline: e.filingDeadline.toISOString(),
    isFiled: e.isFiled,
  };
}

function toFilingDto(f: Filing): FilingResponseDto {
  return { id: f.id, quarter: f.quarter, year: f.year, receiptCode: f.receiptCode, filedAt: f.filedAt.toISOString() };
}

/** No `tenantId` param — every route scoped to the caller's own tenant via `getCurrentTenantId()`, same convention as `SkuController`. */
@ApiTags('tax')
@Controller('tax')
export class TaxFilingController {
  constructor(
    private readonly taxEstimateService: TaxEstimateService,
    private readonly filingService: FilingService,
  ) {}

  @Get('estimate')
  @ApiOperation({ summary: 'Quarterly HKD tax estimate (GTGT + TNCN) for the caller\'s own tenant — defaults to the current quarter' })
  async getEstimate(@Query() query: GetEstimateQueryDto): Promise<TaxEstimateResponseDto> {
    const estimate = await this.taxEstimateService.estimateQuarter(getCurrentTenantId(), query.quarter, query.year);
    return toEstimateDto(estimate);
  }

  @Get('filings')
  @ApiOperation({ summary: "List the caller's tenant filed quarters" })
  async listFilings(): Promise<FilingResponseDto[]> {
    const filings = await this.filingService.listFilings(getCurrentTenantId());
    return filings.map(toFilingDto);
  }

  @Post('filings')
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'A dropped connection + client retry replays the cached filing record instead of erroring on the UNIQUE constraint' })
  @ApiOperation({ summary: '"Đóng sổ kỳ" — record a quarter as filed with its receipt code' })
  async recordFiling(@Body() dto: CreateFilingDto, @Headers('idempotency-key') idempotencyKey?: string): Promise<FilingResponseDto> {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required.');
    }
    const filing = await this.filingService.recordFiling(getCurrentTenantId(), dto.quarter, dto.year, dto.receiptCode, idempotencyKey);
    return toFilingDto(filing);
  }
}
