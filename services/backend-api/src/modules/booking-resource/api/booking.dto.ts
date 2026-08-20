import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class RequestHoldDto {
  @ApiProperty() @IsUUID() resourceId!: string;
  @ApiProperty() @IsString() customerName!: string;
  @ApiProperty() @IsDateString() startsAt!: string;
  @ApiProperty() @IsDateString() endsAt!: string;
  @ApiProperty({ required: false, default: 1 }) @IsOptional() @IsInt() @Min(1) partySize?: number;
  @ApiProperty({ required: false, default: 15, description: 'Minutes before an unconfirmed hold stops counting toward capacity' })
  @IsOptional()
  @IsInt()
  @Min(1)
  holdMinutes?: number;
}

export class ListBookingsQueryDto {
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() resourceId?: string;
  @ApiProperty({ required: false, description: 'Inclusive lower bound on startsAt (ISO 8601)' }) @IsOptional() @IsDateString() from?: string;
  @ApiProperty({ required: false, description: 'Inclusive upper bound on startsAt (ISO 8601)' }) @IsOptional() @IsDateString() to?: string;
}

export class BookingResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() resourceId!: string;
  @ApiProperty() customerName!: string;
  @ApiProperty() startsAt!: Date;
  @ApiProperty() endsAt!: Date;
  @ApiProperty() partySize!: number;
  @ApiProperty() status!: string;
  @ApiProperty({ nullable: true }) holdExpiresAt!: Date | null;
}
