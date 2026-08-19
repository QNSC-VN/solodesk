import type { EncryptedPayload } from '../../../../platform/crypto/encryption.service';
import type { ConnectorProvider, StoredCredential } from '../vault.types';

export const CREDENTIAL_REPOSITORY = Symbol('CREDENTIAL_REPOSITORY');

export interface ICredentialRepository {
  findMetadataByProvider(tenantId: string, provider: ConnectorProvider): Promise<StoredCredential | null>;
  listMetadataByTenant(tenantId: string): Promise<StoredCredential[]>;
  /** The ONLY method that returns ciphertext — callers must decrypt via `EncryptionService` immediately, never persist or log the result. */
  findEncryptedByProvider(tenantId: string, provider: ConnectorProvider): Promise<EncryptedPayload | null>;
  /** Upsert on `(tenantId, provider)` — setting new credentials for a provider replaces the old ones, never versions them (unlike `procurement.negotiated_prices`; a stale/rotated API key has no legitimate reason to be replayed against a past record). */
  upsert(tenantId: string, provider: ConnectorProvider, encrypted: EncryptedPayload): Promise<StoredCredential>;
  deactivate(tenantId: string, provider: ConnectorProvider): Promise<StoredCredential | null>;
}
