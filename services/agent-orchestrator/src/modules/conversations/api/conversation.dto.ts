import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class StartConversationDto {
  @ApiProperty({ enum: ['assistant', 'onboarding'], required: false, default: 'assistant', description: "'onboarding' gets WRITE-capable setup tools (docs Section 5.4) — fixed for the conversation's whole lifetime, never changed after start." })
  @IsOptional()
  @IsIn(['assistant', 'onboarding'])
  mode?: 'assistant' | 'onboarding';
}

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
