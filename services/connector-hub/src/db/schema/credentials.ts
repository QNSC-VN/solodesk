import { pgSchema, uuid, text, boolean, timestamp, customType, unique } from 'drizzle-orm/pg-core';

export const vaultSchema = pgSchema('vault');

const bytea = customType<{ data: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

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
