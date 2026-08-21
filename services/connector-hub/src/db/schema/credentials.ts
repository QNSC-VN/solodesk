import { pgSchema, uuid, text, boolean, timestamp, customType, unique } from 'drizzle-orm/pg-core';
// The ONE canonical provider union lives in the vault domain (it's product
// vocabulary, not storage detail) — re-exported here only for the $type<>()
// below, so the two can never drift apart again (they silently had, once).
import type { ConnectorProvider } from '../../modules/vault/domain/vault.types';

export type { ConnectorProvider };

export const vaultSchema = pgSchema('vault');

const bytea = customType<{ data: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

/** `tenantId` is a plain uuid, not an FK — see this table's migration header comment. */
export const credentials = vaultSchema.table(
  'credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    provider: text('provider').$type<ConnectorProvider>().notNull(),
    encryptedPayload: bytea('encrypted_payload').notNull(),
    iv: bytea('iv').notNull(),
    authTag: bytea('auth_tag').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    // Set by ConnectorVerificationService.verify() — the real result of
    // the last POST /v1/connectors/:provider/verify call, persisted
    // instead of thrown away. Both null = never verified yet, a real,
    // honest state distinct from a failed verification.
    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
    lastVerificationOk: boolean('last_verification_ok'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantProvider: unique().on(t.tenantId, t.provider),
  }),
);
