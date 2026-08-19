import { Module } from '@nestjs/common';
import { WebhookIntakeService } from './application/webhook-intake.service';
import { WebhookEventDrizzleRepository } from './infrastructure/persistence/webhook-event.drizzle-repository';
import { WEBHOOK_EVENT_REPOSITORY } from './domain/ports/webhook-event.repository';

@Module({
  providers: [WebhookIntakeService, { provide: WEBHOOK_EVENT_REPOSITORY, useClass: WebhookEventDrizzleRepository }],
  exports: [WebhookIntakeService],
})
export class WebhooksModule {}
