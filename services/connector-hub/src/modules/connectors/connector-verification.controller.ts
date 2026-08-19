import { BadRequestException, Controller, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { getCurrentTenantId } from '../../platform/tenant-context';
import { ConnectorVerificationService } from './connector-verification.service';
import type { ConnectorProvider } from '../vault/domain/vault.types';

const CONNECTOR_PROVIDERS: readonly string[] = [
  'sepay',
  'ghn',
  'shopee',
  'tiktok_shop',
  'lazada',
  'ghtk',
  'viettelpost',
  'misa_meinvoice',
  'viettel_sinvoice',
  'vnpt_invoice',
  'booking_com',
  'agoda',
  'national_free_platform',
];

@ApiTags('connectors')
@Controller('connectors')
export class ConnectorVerificationController {
  constructor(private readonly connectorVerificationService: ConnectorVerificationService) {}

  @Post(':provider/verify')
  @ApiOperation({ summary: "Verify the caller's tenant vaulted credentials for a provider actually work — a real API call, not a format check" })
  async verify(@Param('provider') providerParam: string): Promise<{ provider: string; verified: boolean }> {
    if (!CONNECTOR_PROVIDERS.includes(providerParam)) {
      throw new BadRequestException(`Unknown provider "${providerParam}". Must be one of: ${CONNECTOR_PROVIDERS.join(', ')}.`);
    }
    const provider = providerParam as ConnectorProvider;
    const verified = await this.connectorVerificationService.verify(getCurrentTenantId(), provider);
    return { provider, verified };
  }
}
