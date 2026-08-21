import { BadRequestException, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { getCurrentTenantId } from '../../platform/tenant-context';
import { ConnectorVerificationService } from './connector-verification.service';
import { VaultService } from '../vault/application/vault.service';
import { CONNECTOR_PROVIDERS, IMPLEMENTED_CONNECTOR_PROVIDERS, type ConnectorProvider } from '../vault/domain/vault.types';

export interface ConnectorStatusDto {
  provider: ConnectorProvider;
  isImplemented: boolean;
  isConfigured: boolean;
  isActive: boolean;
  lastVerifiedAt: Date | null;
  lastVerificationOk: boolean | null;
}

@ApiTags('connectors')
@Controller('connectors')
export class ConnectorVerificationController {
  constructor(
    private readonly connectorVerificationService: ConnectorVerificationService,
    private readonly vaultService: VaultService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: "Per-provider status across the full connector catalog — whether it has a real adapter, whether the caller's tenant configured it, and the last real verify() result if any" })
  async status(): Promise<ConnectorStatusDto[]> {
    const configured = await this.vaultService.listProviders(getCurrentTenantId());
    const byProvider = new Map(configured.map((c) => [c.provider, c]));
    return CONNECTOR_PROVIDERS.map((provider) => {
      const stored = byProvider.get(provider);
      return {
        provider,
        isImplemented: (IMPLEMENTED_CONNECTOR_PROVIDERS as readonly string[]).includes(provider),
        isConfigured: !!stored,
        isActive: stored?.isActive ?? false,
        lastVerifiedAt: stored?.lastVerifiedAt ?? null,
        lastVerificationOk: stored?.lastVerificationOk ?? null,
      };
    });
  }

  @Post(':provider/verify')
  @ApiOperation({ summary: "Verify the caller's tenant vaulted credentials for a provider actually work — a real API call, not a format check" })
  async verify(@Param('provider') providerParam: string): Promise<{ provider: string; verified: boolean }> {
    if (!(CONNECTOR_PROVIDERS as readonly string[]).includes(providerParam)) {
      throw new BadRequestException(`Unknown provider "${providerParam}". Must be one of: ${CONNECTOR_PROVIDERS.join(', ')}.`);
    }
    const provider = providerParam as ConnectorProvider;
    const verified = await this.connectorVerificationService.verify(getCurrentTenantId(), provider);
    return { provider, verified };
  }
}
