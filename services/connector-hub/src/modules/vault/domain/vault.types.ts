export type ConnectorProvider =
  | 'sepay'
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

/** Arbitrary provider-specific fields — API key/secret, shop id, account number, whatever that provider's adapter needs. Never logged, never returned by any endpoint. */
export type CredentialPayload = Record<string, string>;

export interface StoredCredential {
  id: string;
  tenantId: string;
  provider: ConnectorProvider;
  isActive: boolean;
  updatedAt: Date;
}

export interface SetCredentialsInput {
  provider: ConnectorProvider;
  payload: CredentialPayload;
}
