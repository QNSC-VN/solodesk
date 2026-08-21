import { Module } from '@nestjs/common';
import { MessageService } from './application/message.service';
import { MessageController } from './api/message.controller';
import { InternalMessageController } from './api/internal-message.controller';
import { MessageDrizzleRepository } from './infrastructure/persistence/message.drizzle-repository';
import { MESSAGE_REPOSITORY } from './domain/ports/message.repository';

@Module({
  controllers: [MessageController, InternalMessageController],
  providers: [MessageService, { provide: MESSAGE_REPOSITORY, useClass: MessageDrizzleRepository }],
})
export class MessagingModule {}
