import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class SendMessageDto {
  @ApiProperty() @IsString() @MinLength(1) message!: string;
}

export class ConversationStartedResponseDto {
  @ApiProperty() conversationId!: string;
}

export class SendMessageResponseDto {
  @ApiProperty() assistantMessage!: string;
}

export class ConversationMessageResponseDto {
  @ApiProperty({ enum: ['user', 'assistant'] }) role!: 'user' | 'assistant';
  @ApiProperty() content!: string;
}
