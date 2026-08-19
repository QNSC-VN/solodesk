import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

const CONNECTOR_PROVIDERS = [
  'sepay',
  'ghn',
  'shopee',
  'tiktok_shop',
  'lazada',
  'ghtk',
  'viettelpost',
  'misa_meinvoice',
  'viettel_sinvoice',
  'vnpt_invoice',
  'booking_com',
  'agoda',
  'national_free_platform',
] as const;

export class SetCredentialsDto {
  @ApiProperty({
    description: 'Provider-specific fields — e.g. {"apiKey": "...", "shopId": "..."} for Shopee, {"token": "..."} for GHN. Never returned by any endpoint once set.',
    example: { apiKey: 'REPLACE_ME' },
  })
  @IsObject()
  payload!: Record<string, string>;
}

export class StoredCredentialResponseDto {
  @ApiProperty({ enum: CONNECTOR_PROVIDERS }) provider!: string;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() updatedAt!: Date;
}
