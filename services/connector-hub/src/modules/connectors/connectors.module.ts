import { Module } from '@nestjs/common';
import { VaultModule } from '../vault/vault.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { SepayModule } from './sepay/sepay.module';
import { GhnModule } from './ghn/ghn.module';
import { GhtkModule } from './ghtk/ghtk.module';
import { ShopeeModule } from './shopee/shopee.module';
import { TiktokShopModule } from './tiktok-shop/tiktok-shop.module';
import { StubConnectorsModule } from './stub-connectors';
import { ConnectorVerificationService } from './connector-verification.service';
import { ConnectorVerificationController } from './connector-verification.controller';

@Module({
  imports: [VaultModule, WebhooksModule, SepayModule, GhnModule, GhtkModule, ShopeeModule, TiktokShopModule, StubConnectorsModule],
  controllers: [ConnectorVerificationController],
  providers: [ConnectorVerificationService],
})
export class ConnectorsModule {}
