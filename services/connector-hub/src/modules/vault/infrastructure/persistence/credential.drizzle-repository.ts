import { Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { db } from '../../../../db/client';
import { credentials } from '../../../../db/schema/credentials';
import { withTenantTransaction } from '../../../../platform/tenant-context';
import type { EncryptedPayload } from '../../../../platform/crypto/encryption.service';
import type { ICredentialRepository } from '../../domain/ports/credential.repository';
import type { ConnectorProvider, StoredCredential } from '../../domain/vault.types';

function toMetadata(row: typeof credentials.$inferSelect): StoredCredential {
  return {
    id: row.id,
    tenantId: row.tenantId,
    provider: row.provider,
    isActive: row.isActive,
    lastVerifiedAt: row.lastVerifiedAt,
    lastVerificationOk: row.lastVerificationOk,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class CredentialDrizzleRepository implements ICredentialRepository {
  async findMetadataByProvider(tenantId: string, provider: ConnectorProvider): Promise<StoredCredential | null> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(credentials)
        .where(and(eq(credentials.tenantId, tenantId), eq(credentials.provider, provider)))
        .limit(1);
      return rows[0] ? toMetadata(rows[0]) : null;
    });
  }

  async listMetadataByTenant(tenantId: string): Promise<StoredCredential[]> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx.select().from(credentials).where(eq(credentials.tenantId, tenantId));
      return rows.map(toMetadata);
    });
  }

  async findEncryptedByProvider(tenantId: string, provider: ConnectorProvider): Promise<EncryptedPayload | null> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx
        .select({ encryptedPayload: credentials.encryptedPayload, iv: credentials.iv, authTag: credentials.authTag })
        .from(credentials)
        .where(and(eq(credentials.tenantId, tenantId), eq(credentials.provider, provider), eq(credentials.isActive, true)))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      return { ciphertext: row.encryptedPayload, iv: row.iv, authTag: row.authTag };
    });
  }

  async upsert(tenantId: string, provider: ConnectorProvider, encrypted: EncryptedPayload): Promise<StoredCredential> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx
        .insert(credentials)
        .values({ tenantId, provider, encryptedPayload: encrypted.ciphertext, iv: encrypted.iv, authTag: encrypted.authTag })
        .onConflictDoUpdate({
          target: [credentials.tenantId, credentials.provider],
          set: { encryptedPayload: encrypted.ciphertext, iv: encrypted.iv, authTag: encrypted.authTag, isActive: true, updatedAt: new Date() },
        })
        .returning();
      return toMetadata(rows[0]!);
    });
  }

  async deactivate(tenantId: string, provider: ConnectorProvider): Promise<StoredCredential | null> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx
        .update(credentials)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(credentials.tenantId, tenantId), eq(credentials.provider, provider), eq(credentials.isActive, true)))
        .returning();
      return rows[0] ? toMetadata(rows[0]) : null;
    });
  }

  async recordVerification(tenantId: string, provider: ConnectorProvider, ok: boolean): Promise<StoredCredential | null> {
    return withTenantTransaction(db, tenantId, async (tx) => {
      const rows = await tx
        .update(credentials)
        .set({ lastVerifiedAt: new Date(), lastVerificationOk: ok, updatedAt: new Date() })
        .where(and(eq(credentials.tenantId, tenantId), eq(credentials.provider, provider), eq(credentials.isActive, true)))
        .returning();
      return rows[0] ? toMetadata(rows[0]) : null;
    });
  }
}
