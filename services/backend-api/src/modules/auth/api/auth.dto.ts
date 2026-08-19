import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import type { TenantIndustry } from '../../identity-tenant/domain/tenant.types';

export class SignupDto {
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty() @IsString() @MinLength(8) password!: string;
  @ApiProperty() @IsString() legalName!: string;
  @ApiProperty({ enum: ['food_beverage', 'tourism', 'agriculture'] })
  @IsIn(['food_beverage', 'tourism', 'agriculture'])
  industry!: TenantIndustry;
  @ApiProperty({ required: false }) @IsOptional() @IsString() province?: string;
}

export class LoginDto {
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty() @IsString() password!: string;
}

export class GoogleLoginDto {
  @ApiProperty() @IsString() idToken!: string;
}

export class RefreshDto {
  @ApiProperty() @IsString() refreshToken!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() csrfToken?: string;
}

export class ForgotPasswordDto {
  @ApiProperty() @IsEmail() email!: string;
}

export class ResetPasswordDto {
  @ApiProperty() @IsString() token!: string;
  @ApiProperty() @IsString() @MinLength(8) newPassword!: string;
}

export class UpdateMeDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() displayName?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() avatarUrl?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() locale?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() timezone?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() phone?: string;
}

export class LoginResultDto {
  @ApiProperty() accessToken!: string;
  @ApiProperty() refreshToken!: string;
  @ApiProperty() expiresIn!: number;
  @ApiProperty() csrfToken!: string;
  @ApiProperty() user!: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
    locale: string;
    timezone: string;
  };
}
