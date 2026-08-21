import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';
// The ONE canonical provider list lives in the domain — a private copy here
// had already drifted (missing zalo) from the very constant whose comment
// promises the two can never drift apart.
import { CONNECTOR_PROVIDERS } from '../domain/vault.types';

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
  @ApiProperty({ nullable: true, type: Date }) lastVerifiedAt!: Date | null;
  @ApiProperty({ nullable: true, type: Boolean }) lastVerificationOk!: boolean | null;
  @ApiProperty() updatedAt!: Date;
}
