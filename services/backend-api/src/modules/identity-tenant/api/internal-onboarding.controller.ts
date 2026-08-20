import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../../platform/auth/public.decorator';
import { SkipTenantContext } from '../../../platform/skip-tenant-context.decorator';
import { InternalServiceGuard } from '../../../platform/internal-service.guard';
import { TenantService } from '../application/tenant.service';
import { UpdateTenantProfileDto } from './internal-onboarding.dto';
import { TenantResponseDto } from './tenant.dto';
import type { Tenant } from '../domain/tenant.types';

function toDto(t: Tenant): TenantResponseDto {
  return {
    id: t.id,
    legalName: t.legalName,
    industry: t.industry,
    province: t.province,
    activatedAt: t.activatedAt?.toISOString() ?? null,
    isActive: t.isActive,
    taxGroupDefault: t.taxGroupDefault,
  };
}

/**
 * Service-to-service only — agent-orchestrator's `set_business_profile`
 * onboarding tool calls this from inside a Temporal Activity (never a real
 * per-user JWT; the AI copilot is a machine caller acting on the household's
 * behalf mid-conversation, docs Section 5.4's "onboarding copilot flow").
 * Same `@Public()`/`@SkipTenantContext()`/`InternalServiceGuard` shape as
 * `payment-reconcile`'s `InternalPaymentController` — the 3rd application
 * of this shared-secret mechanism (1st: connector-hub -> backend-api, 2nd:
 * agent-orchestrator -> ml-analytics). Never in the Swagger doc.
 */
@ApiExcludeController()
@Controller('internal/onboarding/tenants')
@UseGuards(InternalServiceGuard)
export class InternalOnboardingTenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Post(':tenantId/profile')
  @Public()
  @SkipTenantContext()
  async updateProfile(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Body() dto: UpdateTenantProfileDto): Promise<TenantResponseDto> {
    const tenant = await this.tenantService.updateProfile(tenantId, dto);
    return toDto(tenant);
  }

  /**
   * Called once, by the onboarding copilot's final `complete_onboarding`
   * tool call (agent-orchestrator) — the one signal a client (the mobile
   * app) can check to decide "show the onboarding conversation" vs "show
   * the normal home screen" on login (`GET /v1/tenants/:id`'s `activatedAt`).
   * `TenantService.activateTenant`/`ITenantRepository.activate` already
   * existed, fully wired at every layer below this — this route was
   * genuinely the only missing piece (found while designing the mobile
   * app's login routing, not assumed).
   */
  @Post(':tenantId/complete')
  @Public()
  @SkipTenantContext()
  async complete(@Param('tenantId', ParseUUIDPipe) tenantId: string): Promise<TenantResponseDto> {
    const tenant = await this.tenantService.activateTenant(tenantId);
    return toDto(tenant);
  }
}
