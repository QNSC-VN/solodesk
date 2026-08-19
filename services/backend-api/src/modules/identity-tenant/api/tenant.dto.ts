import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import type { TenantIndustry, TenantMemberRole } from '../domain/tenant.types';

export class CreateTenantDto {
  @ApiProperty()
  @IsString()
  legalName!: string;

  @ApiProperty({ enum: ['food_beverage', 'tourism', 'agriculture'] })
  @IsIn(['food_beverage', 'tourism', 'agriculture'])
  industry!: TenantIndustry;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  province?: string;
}

export class TenantResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() legalName!: string;
  @ApiProperty() industry!: TenantIndustry;
  @ApiProperty() province!: string;
  @ApiProperty({ nullable: true }) activatedAt!: string | null;
  @ApiProperty() isActive!: boolean;
}

export class TenantMemberResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty() role!: TenantMemberRole;
  @ApiProperty() canEdit!: boolean;
}
