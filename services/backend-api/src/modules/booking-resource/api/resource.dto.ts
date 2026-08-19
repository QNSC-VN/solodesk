import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Min } from 'class-validator';

export class CreateResourceDto {
  @ApiProperty() @IsString() name!: string;
  @ApiProperty() @IsString() resourceType!: string;
  @ApiProperty() @IsInt() @Min(1) capacity!: number;
}

export class ResourceResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() resourceType!: string;
  @ApiProperty() capacity!: number;
  @ApiProperty() isActive!: boolean;
}
