import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../../platform/auth/public.decorator';
import { SkipTenantContext } from '../../../platform/skip-tenant-context.decorator';
import { InternalServiceGuard } from '../../../platform/internal-service.guard';
import { runWithTenant } from '../../../platform/tenant-context';
import { CatalogService } from '../application/catalog.service';
import { CreateSkuDto, SkuResponseDto } from './sku.dto';
import type { Sku } from '../domain/catalog.types';

function toDto(s: Sku): SkuResponseDto {
  return { id: s.id, skuCode: s.skuCode, name: s.name, unit: s.unit, category: s.category, unitPrice: s.unitPrice, isActive: s.isActive };
}

/**
 * Service-to-service only — agent-orchestrator's `add_first_product`
 * onboarding tool. Same shape as `identity-tenant`'s
 * `InternalOnboardingTenantController`; `runWithTenant` is required here
 * (unlike the tenant-profile endpoint) because `catalog.skus` IS
 * RLS-scoped, and there's no per-request middleware to enter that ALS
 * context for a machine caller — see `InternalPaymentController` for the
 * same reasoning.
 */
@ApiExcludeController()
@Controller('internal/onboarding/tenants')
@UseGuards(InternalServiceGuard)
export class InternalOnboardingCatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Post(':tenantId/skus')
  @Public()
  @SkipTenantContext()
  async createSku(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Body() dto: CreateSkuDto): Promise<SkuResponseDto> {
    const sku = await runWithTenant(tenantId, () => this.catalogService.createSku(tenantId, dto));
    return toDto(sku);
  }
}
