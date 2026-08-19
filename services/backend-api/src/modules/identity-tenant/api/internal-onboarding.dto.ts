import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import type { TenantIndustry } from '../domain/tenant.types';

export class UpdateTenantProfileDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() legalName?: string;

  @ApiProperty({ enum: ['food_beverage', 'tourism', 'agriculture'], required: false })
  @IsOptional()
  @IsIn(['food_beverage', 'tourism', 'agriculture'])
  industry?: TenantIndustry;
}
