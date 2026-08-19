import { Module } from '@nestjs/common';
import { VaultModule } from '../../vault/vault.module';
import { WebhooksModule } from '../../webhooks/webhooks.module';
import { SepayAdapter } from './sepay.adapter';
import { SepayWebhookController } from './sepay-webhook.controller';

@Module({
  imports: [VaultModule, WebhooksModule],
  controllers: [SepayWebhookController],
  providers: [SepayAdapter],
  exports: [SepayAdapter],
})
export class SepayModule {}
