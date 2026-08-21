import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateComplianceDocumentDto {
  @ApiProperty({ description: 'Free-text document type, e.g. "Giấy chứng nhận ATTP", "Đăng kiểm phương tiện thuỷ"' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  docType!: string;

  @ApiPropertyOptional({ nullable: true, description: 'NULL = known-required-but-missing (the "chưa đủ" state)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  documentNumber?: string;

  @ApiPropertyOptional({ description: 'Date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString({ strict: true } as never)
  issuedOn?: string;

  @ApiPropertyOptional({ description: 'Date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString({ strict: true } as never)
  expiresOn?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isMandatory?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateComplianceDocumentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(200) docType?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(100) documentNumber?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsDateString({ strict: true } as never) issuedOn?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsDateString({ strict: true } as never) expiresOn?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isMandatory?: boolean;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(500) notes?: string | null;
}

export class ComplianceDocumentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() docType!: string;
  @ApiProperty({ nullable: true }) documentNumber!: string | null;
  @ApiProperty({ nullable: true }) issuedOn!: string | null;
  @ApiProperty({ nullable: true }) expiresOn!: string | null;
  @ApiProperty() isMandatory!: boolean;
  @ApiProperty({ nullable: true }) notes!: string | null;
  @ApiProperty({ enum: ['missing', 'expired', 'expiring', 'valid'] }) status!: string;
  @ApiProperty({ nullable: true }) daysRemaining!: number | null;
  @ApiProperty() incompleteCount!: number;
}
