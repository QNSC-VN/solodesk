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
  @ApiProperty({ nullable: true, enum: ['phanPhoi', 'sanXuat', 'dichVu', 'khac'] }) taxGroupDefault!: string | null;
}

const RATE_GROUP_CODES = ['phanPhoi', 'sanXuat', 'dichVu', 'khac'] as const;

export class UpdateTaxProfileDto {
  @ApiProperty({ enum: RATE_GROUP_CODES })
  @IsIn(RATE_GROUP_CODES)
  taxGroupDefault!: (typeof RATE_GROUP_CODES)[number];
}

export class TenantMemberResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty() role!: TenantMemberRole;
  @ApiProperty() canEdit!: boolean;
}
