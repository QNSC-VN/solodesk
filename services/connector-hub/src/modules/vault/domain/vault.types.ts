export type ConnectorProvider =
  | 'sepay'
  | 'zalo'
  | 'ghn'
  | 'shopee'
  | 'tiktok_shop'
  | 'lazada'
  | 'ghtk'
  | 'viettelpost'
  | 'misa_meinvoice'
  | 'viettel_sinvoice'
  | 'vnpt_invoice'
  | 'booking_com'
  | 'agoda'
  | 'national_free_platform';

/** Single source of truth for valid providers — both `VaultController` and `ConnectorVerificationController` validate against this so the two can never silently drift apart. */
export const CONNECTOR_PROVIDERS: readonly ConnectorProvider[] = [
  'sepay',
  'zalo',
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
];

/** Arbitrary provider-specific fields — API key/secret, shop id, account number, whatever that provider's adapter needs. Never logged, never returned by any endpoint. */
export type CredentialPayload = Record<string, string>;

export interface StoredCredential {
  id: string;
  tenantId: string;
  provider: ConnectorProvider;
  isActive: boolean;
  lastVerifiedAt: Date | null;
  lastVerificationOk: boolean | null;
  updatedAt: Date;
}

/** The 6 providers with a real adapter (`ConnectorVerificationService`'s own constructor list) — every other catalog entry is an honest `stub-connectors.ts` "not implemented" throw. Single source of truth so `GET /v1/connectors/status` and the verification service can never silently drift apart. */
export const IMPLEMENTED_CONNECTOR_PROVIDERS: readonly ConnectorProvider[] = ['sepay', 'ghn', 'ghtk', 'shopee', 'tiktok_shop', 'lazada'];

export interface SetCredentialsInput {
  provider: ConnectorProvider;
  payload: CredentialPayload;
}

import { BadRequestException } from '@nestjs/common';

/** Parse-and-validate a provider path segment against the ONE canonical list — the triplicated `includes()` + BadRequest blocks in three controllers, now one function. */
export function parseProvider(value: string): ConnectorProvider {
  const provider = CONNECTOR_PROVIDERS.find((p) => p === value);
  if (!provider) {
    throw new BadRequestException(`Unknown provider "${value}". Must be one of: ${CONNECTOR_PROVIDERS.join(', ')}.`);
  }
  return provider;
}

/** The credential metadata shape every controller returns — the duplicated toDto mappers, now one. */
export interface CredentialMetadataDto {
  provider: ConnectorProvider;
  isActive: boolean;
  lastVerifiedAt: Date | null;
  lastVerificationOk: boolean | null;
  updatedAt: Date;
}

export function toCredentialMetadataDto(c: StoredCredential): CredentialMetadataDto {
  return {
    provider: c.provider,
    isActive: c.isActive,
    lastVerifiedAt: c.lastVerifiedAt,
    lastVerificationOk: c.lastVerificationOk,
    updatedAt: c.updatedAt,
  };
}
