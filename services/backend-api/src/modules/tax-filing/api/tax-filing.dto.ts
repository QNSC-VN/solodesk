import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class GetEstimateQueryDto {
  @ApiProperty({ required: false, description: 'Defaults to the current VN calendar quarter' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4)
  quarter?: number;

  @ApiProperty({ required: false, description: 'Defaults to the current year' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  year?: number;
}

export class CreateFilingDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) @Max(4) quarter!: number;
  @ApiProperty() @Type(() => Number) @IsInt() year!: number;
  @ApiProperty({ description: 'No format validation — no real eTax API to validate against yet' }) @IsString() @MinLength(1) receiptCode!: string;
}

export class TaxRateGroupResponseDto {
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() gtgtRate!: string;
  @ApiProperty() tncnRate!: string;
  @ApiProperty() isDraft!: boolean;
}

export class TaxEstimateResponseDto {
  @ApiProperty() quarter!: number;
  @ApiProperty() year!: number;
  @ApiProperty() revenue!: string;
  @ApiProperty() isExempt!: boolean;
  @ApiProperty() gtgt!: string;
  @ApiProperty() tncn!: string;
  @ApiProperty() total!: string;
  @ApiProperty({ type: TaxRateGroupResponseDto, nullable: true }) rateGroup!: TaxRateGroupResponseDto | null;
  @ApiProperty() filingDeadline!: string;
  @ApiProperty() isFiled!: boolean;
}

export class FilingResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() quarter!: number;
  @ApiProperty() year!: number;
  @ApiProperty() receiptCode!: string;
  @ApiProperty() filedAt!: string;
}
