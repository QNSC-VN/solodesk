import { Module } from '@nestjs/common';
import { ConversationService } from './application/conversation.service';
import { ConversationController } from './api/conversation.controller';

@Module({
  controllers: [ConversationController],
  providers: [ConversationService],
})
export class ConversationsModule {}
