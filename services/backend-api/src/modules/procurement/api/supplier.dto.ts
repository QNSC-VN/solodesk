import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateSupplierDto {
  @ApiProperty() @IsString() name!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() contactInfo?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() taxCode?: string;
}

export class SupplierResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true }) contactInfo!: string | null;
  @ApiProperty({ nullable: true }) taxCode!: string | null;
  @ApiProperty() isActive!: boolean;
}
