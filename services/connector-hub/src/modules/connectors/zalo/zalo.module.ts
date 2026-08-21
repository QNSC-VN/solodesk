import { Module } from '@nestjs/common';
import { VaultModule } from '../../vault/vault.module';
import { WebhooksModule } from '../../webhooks/webhooks.module';
import { ZaloWebhookController } from './zalo-webhook.controller';

/**
 * Zalo is webhook-only: no adapter, no credential vault use, no verify —
 * the inbound-message intake (`ZaloWebhookController`) is its entire real
 * surface today, which is why `IMPLEMENTED_CONNECTOR_PROVIDERS` does not
 * include it and the status screen shows it as not-yet-supported.
 */
@Module({
  imports: [VaultModule, WebhooksModule],
  controllers: [ZaloWebhookController],
})
export class ZaloModule {}
