import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { getCurrentTenantId } from '../../../platform/tenant-context';
import { CatalogService } from '../application/catalog.service';
import { CreateSkuDto, UpdateSkuDto, SkuResponseDto } from './sku.dto';
import type { Sku } from '../domain/catalog.types';

function toDto(s: Sku): SkuResponseDto {
  return {
    id: s.id,
    skuCode: s.skuCode,
    name: s.name,
    unit: s.unit,
    category: s.category,
    unitPrice: s.unitPrice,
    isActive: s.isActive,
  };
}

/**
 * No `tenantId` path/query param on purpose — every route here is scoped to
 * the CALLER's own tenant, read from `getCurrentTenantId()` (Section 4.1),
 * never client-supplied. Different from `TenantController`'s `:id`, where the
 * tenant IS the resource being addressed, not just the auth scope.
 */
@ApiTags('catalog')
@Controller('skus')
export class SkuController {
  constructor(private readonly catalogService: CatalogService) {}

  @Post()
  @ApiOperation({ summary: 'Create a SKU in the caller\'s tenant' })
  async create(@Body() dto: CreateSkuDto): Promise<SkuResponseDto> {
    const sku = await this.catalogService.createSku(getCurrentTenantId(), dto);
    return toDto(sku);
  }

  @Get()
  @ApiOperation({ summary: 'List SKUs in the caller\'s tenant' })
  async list(): Promise<SkuResponseDto[]> {
    const skus = await this.catalogService.listSkus(getCurrentTenantId());
    return skus.map(toDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a SKU by id' })
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<SkuResponseDto> {
    const sku = await this.catalogService.getSku(id, getCurrentTenantId());
    return toDto(sku);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a SKU (price change, deactivate, ...)' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSkuDto): Promise<SkuResponseDto> {
    const sku = await this.catalogService.updateSku(id, getCurrentTenantId(), dto);
    return toDto(sku);
  }
}
