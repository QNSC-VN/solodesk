import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipTenantContext } from '../../../platform/skip-tenant-context.decorator';
import { Public } from '../../../platform/auth/public.decorator';
import { getCurrentTenantId } from '../../../platform/tenant-context';
import { TenantService } from '../application/tenant.service';
import { CreateTenantDto, UpdateTaxProfileDto, TenantResponseDto, TenantMemberResponseDto } from './tenant.dto';
import type { Tenant, TenantMember } from '../domain/tenant.types';

function toTenantDto(t: Tenant): TenantResponseDto {
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

function toMemberDto(m: TenantMember): TenantMemberResponseDto {
  return { id: m.id, userId: m.userId, displayName: m.displayName, role: m.role, canEdit: m.canEdit };
}

@ApiTags('tenants')
@Controller('tenants')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Post()
  @Public()
  @SkipTenantContext()
  @ApiOperation({ summary: 'Onboard a new household/business tenant (runs before any auth/tenant context exists)' })
  // TODO(Sprint 1+): still genuinely public today — real login now exists
  // (src/modules/auth), but real self-serve signup (POST /v1/auth/signup)
  // creates its own tenant directly via SignupService, never through this
  // route. This route is the ORPHANED-tenant path: no owning user gets
  // attached, so it's really a manual/ops onboarding entry point today, not
  // a real product flow. Once staff/admin auth is real, this almost
  // certainly needs to require an authenticated program-staff principal —
  // Mục IV.6 "cầm tay chỉ việc" implies staff-assisted onboarding, not this.
  async createTenant(@Body() dto: CreateTenantDto): Promise<TenantResponseDto> {
    const tenant = await this.tenantService.createTenant(dto);
    return toTenantDto(tenant);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a tenant by id' })
  async getTenant(@Param('id', ParseUUIDPipe) id: string): Promise<TenantResponseDto> {
    const tenant = await this.tenantService.getTenant(id);
    return toTenantDto(tenant);
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'List household members for a tenant (RLS + Section 4.4 assert enforced)' })
  async listMembers(@Param('id', ParseUUIDPipe) id: string): Promise<TenantMemberResponseDto[]> {
    const members = await this.tenantService.listMembers(id);
    return members.map(toMemberDto);
  }

  @Patch('tax-profile')
  @ApiOperation({ summary: "Set the caller's own tenant's tax rate-group (Tax/filing v1 — no self-service tenant-mutation route existed before this)" })
  async updateTaxProfile(@Body() dto: UpdateTaxProfileDto): Promise<TenantResponseDto> {
    const tenant = await this.tenantService.updateProfile(getCurrentTenantId(), { taxGroupDefault: dto.taxGroupDefault });
    return toTenantDto(tenant);
  }
}
