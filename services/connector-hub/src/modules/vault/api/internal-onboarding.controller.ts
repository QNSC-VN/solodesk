import { BadRequestException, Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../../platform/auth/public.decorator';
import { SkipTenantContext } from '../../../platform/skip-tenant-context.decorator';
import { InternalServiceGuard } from '../../../platform/internal-service.guard';
import { runWithTenant } from '../../../platform/tenant-context';
import { VaultService } from '../application/vault.service';
import { SetCredentialsDto, StoredCredentialResponseDto } from './vault.dto';
import { CONNECTOR_PROVIDERS, type ConnectorProvider, type StoredCredential } from '../domain/vault.types';

function toDto(c: StoredCredential): StoredCredentialResponseDto {
  return {
    provider: c.provider,
    isActive: c.isActive,
    lastVerifiedAt: c.lastVerifiedAt,
    lastVerificationOk: c.lastVerificationOk,
    updatedAt: c.updatedAt,
  };
}

/**
 * Service-to-service only — agent-orchestrator's `connect_sepay` onboarding
 * tool. First time connector-hub is on the RECEIVING end of the shared
 * `INTERNAL_SERVICE_TOKEN` mechanism (previously only a caller, forwarding
 * SePay payments to backend-api). Same `@Public()`/`@SkipTenantContext()`/
 * `InternalServiceGuard` shape as backend-api's internal controllers.
 * The credential itself still goes through the exact same
 * `VaultService.setCredentials` -> `EncryptionService` (AES-256-GCM) path
 * as the authenticated tenant-facing route — this is a different caller,
 * not a different (weaker) write path.
 */
@ApiExcludeController()
@Controller('internal/onboarding/vault')
@UseGuards(InternalServiceGuard)
export class InternalOnboardingVaultController {
  constructor(private readonly vaultService: VaultService) {}

  @Post(':tenantId/:provider/credentials')
  @Public()
  @SkipTenantContext()
  async setCredentials(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('provider') providerParam: string,
    @Body() dto: SetCredentialsDto,
  ): Promise<StoredCredentialResponseDto> {
    if (!(CONNECTOR_PROVIDERS as readonly string[]).includes(providerParam)) {
      throw new BadRequestException(`Unknown provider "${providerParam}". Must be one of: ${CONNECTOR_PROVIDERS.join(', ')}.`);
    }
    const provider = providerParam as ConnectorProvider;
    const stored = await runWithTenant(tenantId, () => this.vaultService.setCredentials(tenantId, { provider, payload: dto.payload }));
    return toDto(stored);
  }
}
