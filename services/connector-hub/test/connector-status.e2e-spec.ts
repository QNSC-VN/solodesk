import { describe, it, expect } from 'vitest';
import { uuidv7 } from 'uuidv7';
import { ConfigService } from '@nestjs/config';
import { runWithTenant } from '../src/platform/tenant-context';
import { EncryptionService } from '../src/platform/crypto/encryption.service';
import { CredentialDrizzleRepository } from '../src/modules/vault/infrastructure/persistence/credential.drizzle-repository';
import { WebhookTokenDrizzleRepository } from '../src/modules/vault/infrastructure/persistence/webhook-token.drizzle-repository';
import { VaultService } from '../src/modules/vault/application/vault.service';
import { ConnectorVerificationController } from '../src/modules/connectors/connector-verification.controller';
import type { ConnectorVerificationService } from '../src/modules/connectors/connector-verification.service';
import { CONNECTOR_PROVIDERS } from '../src/modules/vault/domain/vault.types';
import type { Env } from '../src/config/env.schema';

/**
 * Real Postgres, no mocks — covers gap #4's actual new behavior: persisting
 * a real verify() outcome onto vault.credentials, and the status catalog
 * merge (`GET /v1/connectors/status`) that reads it back alongside the full
 * 13-provider catalog. `connectorVerificationService` is unused by
 * `status()` — stubbed since constructing the real one needs all 13 adapter
 * instances, none of which this test exercises.
 */

const configService = new ConfigService<Env>({ VAULT_MASTER_KEY: process.env.VAULT_MASTER_KEY });
const encryptionService = new EncryptionService(configService);
const credentialRepo = new CredentialDrizzleRepository();
const webhookTokenRepo = new WebhookTokenDrizzleRepository();
const vaultService = new VaultService(credentialRepo, webhookTokenRepo, encryptionService);
const controller = new ConnectorVerificationController({} as unknown as ConnectorVerificationService, vaultService);

describe('Connector status v1 — real Postgres, no mocks', () => {
  it('recordVerificationResult persists a real success and is reflected in listProviders', async () => {
    const tenantId = uuidv7();
    await runWithTenant(tenantId, () => vaultService.setCredentials(tenantId, { provider: 'ghn', payload: { token: 'x', shopId: '1' } }));
    await runWithTenant(tenantId, () => vaultService.recordVerificationResult(tenantId, 'ghn', true));

    const list = await runWithTenant(tenantId, () => vaultService.listProviders(tenantId));
    expect(list).toHaveLength(1);
    expect(list[0]!.lastVerificationOk).toBe(true);
    expect(list[0]!.lastVerifiedAt).not.toBeNull();
  });

  it('recordVerificationResult persists a real failure honestly, not a fabricated success', async () => {
    const tenantId = uuidv7();
    await runWithTenant(tenantId, () => vaultService.setCredentials(tenantId, { provider: 'shopee', payload: { apiKey: 'x' } }));
    await runWithTenant(tenantId, () => vaultService.recordVerificationResult(tenantId, 'shopee', false));

    const list = await runWithTenant(tenantId, () => vaultService.listProviders(tenantId));
    expect(list[0]!.lastVerificationOk).toBe(false);
  });

  it('recordVerificationResult returns null when no active credential row exists for the provider', async () => {
    const tenantId = uuidv7();
    const result = await runWithTenant(tenantId, () => vaultService.recordVerificationResult(tenantId, 'lazada', true));
    expect(result).toBeNull();
  });

  it('a never-verified credential surfaces both fields as null, not a guessed default', async () => {
    const tenantId = uuidv7();
    await runWithTenant(tenantId, () => vaultService.setCredentials(tenantId, { provider: 'sepay', payload: { apiToken: 'x', webhookSecret: 'y' } }));

    const list = await runWithTenant(tenantId, () => vaultService.listProviders(tenantId));
    expect(list[0]!.lastVerifiedAt).toBeNull();
    expect(list[0]!.lastVerificationOk).toBeNull();
  });

  it('GET /v1/connectors/status merges the full 13-provider catalog with real per-tenant state and the isImplemented flag', async () => {
    const tenantId = uuidv7();
    await runWithTenant(tenantId, () => vaultService.setCredentials(tenantId, { provider: 'ghn', payload: { token: 'x', shopId: '1' } }));
    await runWithTenant(tenantId, () => vaultService.recordVerificationResult(tenantId, 'ghn', true));

    const status = await runWithTenant(tenantId, () => controller.status());

    expect(status).toHaveLength(CONNECTOR_PROVIDERS.length);

    const ghn = status.find((s) => s.provider === 'ghn')!;
    expect(ghn.isImplemented).toBe(true);
    expect(ghn.isConfigured).toBe(true);
    expect(ghn.isActive).toBe(true);
    expect(ghn.lastVerificationOk).toBe(true);

    const unconfigured = status.find((s) => s.provider === 'agoda')!;
    expect(unconfigured.isImplemented).toBe(false); // agoda has no real adapter yet
    expect(unconfigured.isConfigured).toBe(false);
    expect(unconfigured.lastVerifiedAt).toBeNull();
  });

  it('deactivating a provider is reflected as isActive=false in the status catalog, not dropped from it', async () => {
    const tenantId = uuidv7();
    await runWithTenant(tenantId, () => vaultService.setCredentials(tenantId, { provider: 'tiktok_shop', payload: { apiKey: 'x' } }));
    await runWithTenant(tenantId, () => vaultService.deactivate(tenantId, 'tiktok_shop'));

    const status = await runWithTenant(tenantId, () => controller.status());
    const tiktok = status.find((s) => s.provider === 'tiktok_shop')!;
    expect(tiktok.isConfigured).toBe(true); // a credential row exists (matches GET /v1/vault's own list() semantics — deactivated still listed, just isActive:false)
    expect(tiktok.isActive).toBe(false);
  });
});
