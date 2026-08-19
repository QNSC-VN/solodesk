import { describe, it, expect } from 'vitest';
import { uuidv7 } from 'uuidv7';
import { ConfigService } from '@nestjs/config';
import { runWithTenant, withTenantTransaction } from '../src/platform/tenant-context';
import { EncryptionService } from '../src/platform/crypto/encryption.service';
import { CredentialDrizzleRepository } from '../src/modules/vault/infrastructure/persistence/credential.drizzle-repository';
import { WebhookTokenDrizzleRepository } from '../src/modules/vault/infrastructure/persistence/webhook-token.drizzle-repository';
import { VaultService } from '../src/modules/vault/application/vault.service';
import { db } from '../src/db/client';
import { credentials } from '../src/db/schema/credentials';
import type { Env } from '../src/config/env.schema';

/**
 * Real Postgres, no mocks — the encrypt-at-rest roundtrip and RLS tenant
 * isolation are the two things that matter most for a credential vault.
 */

const configService = new ConfigService<Env>({ VAULT_MASTER_KEY: process.env.VAULT_MASTER_KEY });
const encryptionService = new EncryptionService(configService);
const credentialRepo = new CredentialDrizzleRepository();
const webhookTokenRepo = new WebhookTokenDrizzleRepository();
const vaultService = new VaultService(credentialRepo, webhookTokenRepo, encryptionService);

describe('Vault — real Postgres, no mocks', () => {
  it('a set credential decrypts back to the exact original payload', async () => {
    const tenantId = uuidv7();
    const payload = { apiKey: 'sk_live_super_secret_123', shopId: '999888' };

    await runWithTenant(tenantId, () => vaultService.setCredentials(tenantId, { provider: 'shopee', payload }));
    const decrypted = await runWithTenant(tenantId, () => vaultService.getDecryptedPayload(tenantId, 'shopee'));

    expect(decrypted).toEqual(payload);
  });

  it('the stored row never exposes the plaintext via metadata listing', async () => {
    const tenantId = uuidv7();
    await runWithTenant(tenantId, () => vaultService.setCredentials(tenantId, { provider: 'ghn', payload: { token: 'secret-token', shopId: '1' } }));

    const list = await runWithTenant(tenantId, () => vaultService.listProviders(tenantId));
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty('payload');
    expect(JSON.stringify(list[0])).not.toContain('secret-token');
  });

  it('setting new credentials for the same tenant+provider replaces the old ones (upsert, not versioned)', async () => {
    const tenantId = uuidv7();
    await runWithTenant(tenantId, () => vaultService.setCredentials(tenantId, { provider: 'sepay', payload: { apiToken: 'old-token', webhookSecret: 'old-secret' } }));
    await runWithTenant(tenantId, () => vaultService.setCredentials(tenantId, { provider: 'sepay', payload: { apiToken: 'new-token', webhookSecret: 'new-secret' } }));

    const decrypted = await runWithTenant(tenantId, () => vaultService.getDecryptedPayload(tenantId, 'sepay'));
    expect(decrypted).toEqual({ apiToken: 'new-token', webhookSecret: 'new-secret' });

    const list = await runWithTenant(tenantId, () => vaultService.listProviders(tenantId));
    expect(list).toHaveLength(1); // replaced, not a second row
  });

  it('RLS forces tenant filtering even on a raw query with no explicit WHERE tenant_id clause', async () => {
    const tenantA = uuidv7();
    const tenantB = uuidv7();
    await runWithTenant(tenantA, () => vaultService.setCredentials(tenantA, { provider: 'ghn', payload: { token: 'a-secret', shopId: '1' } }));
    await runWithTenant(tenantB, () => vaultService.setCredentials(tenantB, { provider: 'ghn', payload: { token: 'b-secret', shopId: '2' } }));

    // A query with NO .where() clause at all, scoped only by `SET LOCAL
    // app.tenant_id` — this is what ENABLE/FORCE ROW LEVEL SECURITY actually
    // buys over application-level correctness: even a query that forgot to
    // filter by tenant still can't see another tenant's row.
    const rowsUnderTenantB = await withTenantTransaction(db, tenantB, (tx) => tx.select().from(credentials));

    expect(rowsUnderTenantB.every((r) => r.tenantId === tenantB)).toBe(true);
    expect(rowsUnderTenantB.some((r) => r.tenantId === tenantA)).toBe(false);
  });

  it('deactivating credentials makes them unavailable to getDecryptedPayload', async () => {
    const tenantId = uuidv7();
    await runWithTenant(tenantId, () => vaultService.setCredentials(tenantId, { provider: 'shopee', payload: { apiKey: 'x' } }));
    await runWithTenant(tenantId, () => vaultService.deactivate(tenantId, 'shopee'));

    const decrypted = await runWithTenant(tenantId, () => vaultService.getDecryptedPayload(tenantId, 'shopee'));
    expect(decrypted).toBeNull();
  });

  it('getOrCreateWebhookToken is idempotent and resolves back to the same tenant+provider with no tenant context needed', async () => {
    const tenantId = uuidv7();
    const tokenA = await runWithTenant(tenantId, () => vaultService.getOrCreateWebhookToken(tenantId, 'sepay'));
    const tokenB = await runWithTenant(tenantId, () => vaultService.getOrCreateWebhookToken(tenantId, 'sepay'));
    expect(tokenA).toBe(tokenB);

    // No runWithTenant wrapper — this is the public-resolution path an inbound webhook uses.
    const resolved = await vaultService.resolveWebhookToken(tokenA);
    expect(resolved).toEqual({ tenantId, provider: 'sepay' });
  });
});
