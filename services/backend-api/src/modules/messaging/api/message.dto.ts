import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class ListMessagesQueryDto {
  @ApiPropertyOptional({ required: false, description: 'Only messages with no reply yet' })
  @IsOptional()
  @IsIn(['true'])
  unanswered?: string;
}

export class ReplyMessageDto {
  @ApiProperty() @IsString() @MinLength(1) content!: string;
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
