import { Injectable } from '@nestjs/common';
import { NotFoundException } from '@qnsc-vn/platform-http';
import { VaultService } from '../vault/application/vault.service';
import { SepayAdapter } from './sepay/sepay.adapter';
import { GhnAdapter } from './ghn/ghn.adapter';
import { GhtkAdapter } from './ghtk/ghtk.adapter';
import { ShopeeAdapter } from './shopee/shopee.adapter';
import { TiktokShopAdapter } from './tiktok-shop/tiktok-shop.adapter';
import { LazadaAdapter } from './lazada/lazada.adapter';
import {
  ViettelpostAdapter,
  MisaMeinvoiceAdapter,
  ViettelSinvoiceAdapter,
  VnptInvoiceAdapter,
  BookingComAdapter,
  AgodaAdapter,
  NationalFreePlatformAdapter,
} from './stub-connectors';
import type { IConnectorAdapter } from './connector.interface';
import type { ConnectorProvider } from '../vault/domain/vault.types';

/**
 * The uniform "does this just-entered credential actually work" check —
 * `POST /v1/connectors/:provider/verify`, the concrete way a tenant confirms
 * a real key they entered via the vault is good, across EVERY provider
 * (including the stubs, which answer honestly with a clear
 * not-implemented error rather than a fake success).
 */
@Injectable()
export class ConnectorVerificationService {
  private readonly adapters: Map<ConnectorProvider, IConnectorAdapter>;

  constructor(
    private readonly vaultService: VaultService,
    sepay: SepayAdapter,
    ghn: GhnAdapter,
    ghtk: GhtkAdapter,
    shopee: ShopeeAdapter,
    tiktokShop: TiktokShopAdapter,
    lazada: LazadaAdapter,
    viettelpost: ViettelpostAdapter,
    misaMeinvoice: MisaMeinvoiceAdapter,
    viettelSinvoice: ViettelSinvoiceAdapter,
    vnptInvoice: VnptInvoiceAdapter,
    bookingCom: BookingComAdapter,
    agoda: AgodaAdapter,
    nationalFreePlatform: NationalFreePlatformAdapter,
  ) {
    const all: IConnectorAdapter[] = [
      sepay,
      ghn,
      shopee,
      tiktokShop,
      lazada,
      ghtk,
      viettelpost,
      misaMeinvoice,
      viettelSinvoice,
      vnptInvoice,
      bookingCom,
      agoda,
      nationalFreePlatform,
    ];
    this.adapters = new Map(all.map((a) => [a.provider, a]));
  }

  async verify(tenantId: string, provider: ConnectorProvider): Promise<boolean> {
    const payload = await this.vaultService.getDecryptedPayload(tenantId, provider);
    if (!payload) {
      throw new NotFoundException('CREDENTIAL_NOT_FOUND', `No credentials configured for provider "${provider}" — set them via POST /v1/vault/${provider}/credentials first.`);
    }
    const adapter = this.adapters.get(provider)!;
    return adapter.verifyCredentials(payload);
  }
}
