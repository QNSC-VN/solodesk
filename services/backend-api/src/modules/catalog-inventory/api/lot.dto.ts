import { ApiProperty } from '@nestjs/swagger';
import { IsNumberString, IsOptional, IsString, IsUUID } from 'class-validator';

export class ReceiveLotDto {
  @ApiProperty() @IsUUID() skuId!: string;
  @ApiProperty() @IsString() lotCode!: string;
  @ApiProperty() @IsNumberString() quantity!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() sourceChannel?: string;
}

export class StockMutationDto {
  @ApiProperty() @IsNumberString() qty!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() referenceId?: string;
}

export class SellFromSkuDto {
  @ApiProperty() @IsUUID() skuId!: string;
  @ApiProperty() @IsNumberString() qty!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() referenceId?: string;
}

export class LotResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() skuId!: string;
  @ApiProperty() lotCode!: string;
  @ApiProperty() quantityOnHand!: string;
  @ApiProperty() quantityReserved!: string;
  @ApiProperty({ nullable: true }) sourceChannel!: string | null;
}

export class AvailableQuantityResponseDto {
  @ApiProperty() skuId!: string;
  @ApiProperty() totalOnHand!: string;
  @ApiProperty() totalReserved!: string;
  @ApiProperty() totalAvailable!: string;
}

export class StockSummaryResponseDto {
  @ApiProperty() skuId!: string;
  @ApiProperty() skuCode!: string;
  @ApiProperty() name!: string;
  @ApiProperty() unit!: string;
  @ApiProperty({ nullable: true }) category!: string | null;
  @ApiProperty() unitPrice!: string;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() totalOnHand!: string;
  @ApiProperty() totalReserved!: string;
  @ApiProperty() totalAvailable!: string;
}
