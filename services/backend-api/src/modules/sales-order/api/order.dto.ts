import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsNumberString, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';

export class CreateOrderLineDto {
  @ApiProperty() @IsUUID() skuId!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() lotId?: string;
  @ApiProperty() @IsNumberString() quantity!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsNumberString() unitPrice?: string;
}

export class CreateOrderDto {
  @ApiProperty({ enum: ['counter', 'shopee', 'tiktok_shop', 'lazada', 'phone', 'other'] })
  @IsIn(['counter', 'shopee', 'tiktok_shop', 'lazada', 'phone', 'other'])
  channel!: 'counter' | 'shopee' | 'tiktok_shop' | 'lazada' | 'phone' | 'other';

  @ApiProperty({ required: false }) @IsOptional() @IsString() customerName?: string;

  @ApiProperty({ type: [CreateOrderLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderLineDto)
  lines!: CreateOrderLineDto[];
}

export class OrderLineResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() skuId!: string;
  @ApiProperty() lotId!: string;
  @ApiProperty() quantity!: string;
  @ApiProperty() unitPrice!: string;
  @ApiProperty() lineTotal!: string;
}

export class OrderResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() channel!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ nullable: true }) customerName!: string | null;
  @ApiProperty() totalAmount!: string;
  @ApiProperty({ type: [OrderLineResponseDto] }) lines!: OrderLineResponseDto[];
}
