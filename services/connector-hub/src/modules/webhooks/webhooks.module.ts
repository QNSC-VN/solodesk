import { Module } from '@nestjs/common';
import { WebhookIntakeService } from './application/webhook-intake.service';
import { BackendApiPaymentClient } from './backend-api-payment.client';
import { BackendApiMessageClient } from './backend-api-message.client';
import { WebhookEventDrizzleRepository } from './infrastructure/persistence/webhook-event.drizzle-repository';
import { WEBHOOK_EVENT_REPOSITORY } from './domain/ports/webhook-event.repository';

@Module({
  providers: [WebhookIntakeService, BackendApiPaymentClient, BackendApiMessageClient, { provide: WEBHOOK_EVENT_REPOSITORY, useClass: WebhookEventDrizzleRepository }],
  exports: [WebhookIntakeService, BackendApiPaymentClient, BackendApiMessageClient],
})
export class WebhooksModule {}
