import { ApiProperty } from '@nestjs/swagger';

export class LotTraceResponseDto {
  @ApiProperty() lotId!: string;
  @ApiProperty() skuName!: string;
  @ApiProperty({ nullable: true }) skuCategory!: string | null;
  @ApiProperty() lotCode!: string;
  @ApiProperty({ nullable: true }) sourceChannel!: string | null;
  @ApiProperty({ nullable: true }) supplierName!: string | null;
  @ApiProperty() receivedAt!: Date;
  @ApiProperty() publishedAt!: Date;
}
