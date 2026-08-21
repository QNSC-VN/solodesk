import { Inject, Injectable } from '@nestjs/common';
import { NotFoundException } from '@qnsc-vn/platform-http';
import { assertTenantMatchesSession } from '../../../platform/tenant-context';
import { EncryptionService } from '../../../platform/crypto/encryption.service';
import { CREDENTIAL_REPOSITORY, type ICredentialRepository } from '../domain/ports/credential.repository';
import { WEBHOOK_TOKEN_REPOSITORY, type IWebhookTokenRepository, type ResolvedWebhookToken } from '../domain/ports/webhook-token.repository';
import type { ConnectorProvider, CredentialPayload, SetCredentialsInput, StoredCredential } from '../domain/vault.types';

/**
 * The concrete "input the real key later" feature — `setCredentials` is
 * where a tenant's real Shopee/GHN/SePay API key ever enters this system,
 * encrypted immediately (`EncryptionService`, AES-256-GCM) before it ever
 * reaches the repository. `getDecryptedPayload` is the ONLY way plaintext
 * comes back out, and it's for connector adapters to call internally —
 * never exposed over HTTP. `listProviders`/the API layer only ever return
 * metadata (provider, isActive, updatedAt), matching how a real secrets
 * vault behaves: write-only from the outside, readable only by the system
 * that needs to actually use the secret.
 */
@Injectable()
export class VaultService {
  constructor(
    @Inject(CREDENTIAL_REPOSITORY) private readonly credentialRepository: ICredentialRepository,
    @Inject(WEBHOOK_TOKEN_REPOSITORY) private readonly webhookTokenRepository: IWebhookTokenRepository,
    private readonly encryptionService: EncryptionService,
  ) {}

  async setCredentials(tenantId: string, input: SetCredentialsInput): Promise<StoredCredential> {
    assertTenantMatchesSession(tenantId);
    const encrypted = this.encryptionService.encrypt(JSON.stringify(input.payload));
    return this.credentialRepository.upsert(tenantId, input.provider, encrypted);
  }

  async getDecryptedPayload(tenantId: string, provider: ConnectorProvider): Promise<CredentialPayload | null> {
    assertTenantMatchesSession(tenantId);
    const encrypted = await this.credentialRepository.findEncryptedByProvider(tenantId, provider);
    if (!encrypted) return null;
    return JSON.parse(this.encryptionService.decrypt(encrypted)) as CredentialPayload;
  }

  async listProviders(tenantId: string): Promise<StoredCredential[]> {
    assertTenantMatchesSession(tenantId);
    return this.credentialRepository.listMetadataByTenant(tenantId);
  }

  async deactivate(tenantId: string, provider: ConnectorProvider): Promise<StoredCredential> {
    assertTenantMatchesSession(tenantId);
    const result = await this.credentialRepository.deactivate(tenantId, provider);
    if (!result) {
      throw new NotFoundException('CREDENTIAL_NOT_FOUND', `No active credentials for provider "${provider}".`);
    }
    return result;
  }

  /** Called by `ConnectorVerificationService.verify()` right after a real verify call — persists the outcome instead of it being thrown away over HTTP. Null if the tenant has no active credential row for the provider (shouldn't happen — `verify()` already requires one to run the check at all). */
  async recordVerificationResult(tenantId: string, provider: ConnectorProvider, ok: boolean): Promise<StoredCredential | null> {
    assertTenantMatchesSession(tenantId);
    return this.credentialRepository.recordVerification(tenantId, provider, ok);
  }

  /** The URL segment a tenant configures in a provider's dashboard as their webhook endpoint (e.g. `POST /v1/webhooks/sepay/:token`). Idempotent — always returns the same token for a given tenant+provider. */
  async getOrCreateWebhookToken(tenantId: string, provider: ConnectorProvider): Promise<string> {
    assertTenantMatchesSession(tenantId);
    return this.webhookTokenRepository.getOrCreate(tenantId, provider);
  }

  /** Public path — no tenant context yet, this IS how one gets established for an inbound webhook. */
  async resolveWebhookToken(token: string): Promise<ResolvedWebhookToken | null> {
    return this.webhookTokenRepository.resolve(token);
  }
}
