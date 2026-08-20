import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class GetCustomerDetailQueryDto {
  @ApiProperty() @IsString() @MinLength(1) name!: string;
}

export class CustomerSummaryResponseDto {
  @ApiProperty() name!: string;
  @ApiProperty() orderCount!: number;
  @ApiProperty() totalSpent!: string;
  @ApiProperty({ nullable: true }) firstOrderAt!: string | null;
  @ApiProperty({ nullable: true }) lastOrderAt!: string | null;
  @ApiProperty({ nullable: true }) primaryChannel!: string | null;
  @ApiProperty() bookingCount!: number;
}

export class CustomerOrderResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() channel!: string;
  @ApiProperty() status!: string;
  @ApiProperty() totalAmount!: string;
  @ApiProperty() createdAt!: string;
}

export class CustomerBookingResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() resourceId!: string;
  @ApiProperty() status!: string;
  @ApiProperty() startsAt!: string;
  @ApiProperty() endsAt!: string;
  @ApiProperty() partySize!: number;
}

export class CustomerDetailResponseDto extends CustomerSummaryResponseDto {
  @ApiProperty({ type: [CustomerOrderResponseDto] }) orders!: CustomerOrderResponseDto[];
  @ApiProperty({ type: [CustomerBookingResponseDto] }) bookings!: CustomerBookingResponseDto[];
}
