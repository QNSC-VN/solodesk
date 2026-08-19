import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNumberString, IsOptional, IsString } from 'class-validator';

export class CreateSkuDto {
  @ApiProperty() @IsString() skuCode!: string;
  @ApiProperty() @IsString() name!: string;
  @ApiProperty() @IsString() unit!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() category?: string;
  @ApiProperty() @IsNumberString() unitPrice!: string;
}

export class UpdateSkuDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() name?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() unit?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() category?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsNumberString() unitPrice?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsIn([true, false]) isActive?: boolean;
}

export class SkuResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() skuCode!: string;
  @ApiProperty() name!: string;
  @ApiProperty() unit!: string;
  @ApiProperty({ nullable: true }) category!: string | null;
  @ApiProperty() unitPrice!: string;
  @ApiProperty() isActive!: boolean;
}
