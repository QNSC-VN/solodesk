import { ApiProperty } from '@nestjs/swagger';

export class NotificationResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() type!: string;
  @ApiProperty() title!: string;
  @ApiProperty() body!: string;
  @ApiProperty() isRead!: boolean;
  @ApiProperty({ nullable: true }) readAt!: string | null;
  @ApiProperty() createdAt!: string;
}

export class UnreadCountResponseDto {
  @ApiProperty() count!: number;
}
