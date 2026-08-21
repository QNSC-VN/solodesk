import { BadRequestException, Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { getCurrentTenantId } from '../../../platform/tenant-context';
import { VaultService } from '../application/vault.service';
import { SetCredentialsDto, StoredCredentialResponseDto } from './vault.dto';
import { CONNECTOR_PROVIDERS, type ConnectorProvider, type StoredCredential, parseProvider, toCredentialMetadataDto } from '../domain/vault.types';


@ApiTags('vault')
@Controller('vault')
export class VaultController {
  constructor(private readonly vaultService: VaultService) {}

  @Post(':provider/credentials')
  @ApiOperation({ summary: 'Set (or rotate) a provider\'s credentials — encrypted at rest, never returned again by any endpoint' })
  async setCredentials(@Param('provider') providerParam: string, @Body() dto: SetCredentialsDto): Promise<StoredCredentialResponseDto> {
    const provider = parseProvider(providerParam);
    const stored = await this.vaultService.setCredentials(getCurrentTenantId(), { provider, payload: dto.payload });
    return toCredentialMetadataDto(stored);
  }

  @Get()
  @ApiOperation({ summary: "List which providers the caller's tenant has configured — metadata only, never the secret" })
  async list(): Promise<StoredCredentialResponseDto[]> {
    const list = await this.vaultService.listProviders(getCurrentTenantId());
    return list.map(toCredentialMetadataDto);
  }

  @Delete(':provider/credentials')
  @ApiOperation({ summary: 'Deactivate a provider\'s credentials' })
  async deactivate(@Param('provider') providerParam: string): Promise<StoredCredentialResponseDto> {
    const provider = parseProvider(providerParam);
    const stored = await this.vaultService.deactivate(getCurrentTenantId(), provider);
    return toCredentialMetadataDto(stored);
  }

  @Get(':provider/webhook-url')
  @ApiOperation({ summary: 'Get the URL to configure as this webhook-capable provider\'s callback endpoint (e.g. in SePay\'s dashboard)' })
  async getWebhookUrl(@Param('provider') providerParam: string): Promise<{ url: string }> {
    const provider = parseProvider(providerParam);
    const token = await this.vaultService.getOrCreateWebhookToken(getCurrentTenantId(), provider);
    return { url: `/v1/webhooks/${provider}/${token}` };
  }
}
