import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class ListMessagesQueryDto {
  @ApiPropertyOptional({ required: false, description: 'Only messages with no reply yet' })
  @IsOptional()
  @IsIn(['true'])
  unanswered?: string;
}

export class ReplyMessageDto {
  @ApiProperty() @IsString() @MinLength(1) content!: string;
}

export class InboundMessageDto {
  @ApiProperty() @IsUUID() tenantId!: string;
  @ApiProperty({ enum: ['zalo'] }) @IsIn(['zalo']) channel!: 'zalo';
  @ApiProperty() @IsString() @MinLength(1) customerName!: string;
  @ApiProperty() @IsString() @MinLength(1) content!: string;
  @ApiProperty() @IsString() @MinLength(1) sourceEventId!: string;
  @ApiProperty() @IsISO8601() occurredAt!: string;
}

export class MessageResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() channel!: string;
  @ApiProperty() direction!: string;
  @ApiProperty() customerName!: string;
  @ApiProperty() content!: string;
  @ApiProperty({ nullable: true }) reply!: string | null;
  @ApiProperty({ nullable: true }) repliedAt!: Date | null;
  @ApiProperty() occurredAt!: Date;
  @ApiProperty() createdAt!: Date;
}

import type { Message } from '../domain/message.types';

/** ONE mapper for both controllers — a second copy had already started drifting. */
export function toMessageDto(m: Message): MessageResponseDto {
  return {
    id: m.id,
    channel: m.channel,
    direction: m.direction,
    customerName: m.customerName,
    content: m.content,
    reply: m.reply,
    repliedAt: m.repliedAt,
    occurredAt: m.occurredAt,
    createdAt: m.createdAt,
  };
}
