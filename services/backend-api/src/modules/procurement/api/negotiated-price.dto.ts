import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNumberString, IsOptional, IsUUID } from 'class-validator';

export class SetNegotiatedPriceDto {
  @ApiProperty() @IsUUID() skuId!: string;
  @ApiProperty() @IsNumberString() unitCost!: string;
  @ApiProperty({ required: false, description: 'Defaults to today' }) @IsOptional() @IsDateString() effectiveFrom?: string;
}

export class NegotiatedPriceResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() supplierId!: string;
  @ApiProperty() skuId!: string;
  @ApiProperty() unitCost!: string;
  @ApiProperty() effectiveFrom!: string;
  @ApiProperty({ nullable: true }) effectiveTo!: string | null;
}
