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

/** A form field for a "form"-type step — see `present-step.tool.ts`. */
export class StepFieldDto {
  @ApiProperty() name!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ enum: ['text', 'number'] }) inputType!: 'text' | 'number';
}

/**
 * Generative UI (onboarding mode only) — declares the input widget the
 * client should render for the CURRENT question, from a fixed closed
 * catalog. See `present-step.tool.ts`'s header comment for why this exists
 * instead of a single free-text box for every question.
 */
export class StepDto {
  @ApiProperty({ enum: ['choice', 'text', 'form'] }) inputType!: 'choice' | 'text' | 'form';
  @ApiProperty({ required: false, type: [String] }) options?: string[];
  @ApiProperty({ required: false, type: [StepFieldDto] }) fields?: StepFieldDto[];
}

export class SendMessageResponseDto {
  @ApiProperty() assistantMessage!: string;
  @ApiProperty({ required: false, type: StepDto }) step?: StepDto;
}

export class ConversationMessageResponseDto {
  @ApiProperty({ enum: ['user', 'assistant'] }) role!: 'user' | 'assistant';
  @ApiProperty() content!: string;
}
