import { Module } from '@nestjs/common';
import { ResendEmailProvider } from './infrastructure/email-providers/resend-email.provider';
import { SesEmailProvider } from './infrastructure/email-providers/ses-email.provider';
import { EmailDispatcher } from './application/email-dispatcher.service';
import { NotificationService } from './application/notification.service';
import { EmailOutboxRelayService } from './application/email-outbox-relay.service';
import { NotificationController } from './api/notification.controller';

@Module({
  controllers: [NotificationController],
  providers: [ResendEmailProvider, SesEmailProvider, EmailDispatcher, NotificationService, EmailOutboxRelayService],
  exports: [NotificationService, EmailOutboxRelayService],
})
export class NotificationsModule {}
