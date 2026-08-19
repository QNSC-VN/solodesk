import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNumberString, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';

export class CreatePurchaseNoteLineDto {
  @ApiProperty() @IsUUID() skuId!: string;
  @ApiProperty() @IsString() lotCode!: string;
  @ApiProperty() @IsNumberString() quantity!: string;
  @ApiProperty({ required: false, description: 'Overrides the active negotiated price' })
  @IsOptional()
  @IsNumberString()
  unitCost?: string;
}

export class CreatePurchaseNoteDto {
  @ApiProperty() @IsUUID() supplierId!: string;

  @ApiProperty({ type: [CreatePurchaseNoteLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseNoteLineDto)
  lines!: CreatePurchaseNoteLineDto[];
}

export class PurchaseNoteLineResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() skuId!: string;
  @ApiProperty() lotId!: string;
  @ApiProperty() quantity!: string;
  @ApiProperty() unitCost!: string;
  @ApiProperty() lineTotal!: string;
}

export class PurchaseNoteResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() supplierId!: string;
  @ApiProperty() status!: string;
  @ApiProperty() totalAmount!: string;
  @ApiProperty({ type: [PurchaseNoteLineResponseDto] }) lines!: PurchaseNoteLineResponseDto[];
}
