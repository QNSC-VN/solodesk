import { uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { identitySchema, tenants } from './tenants';
import { users } from './users';

export type AuthTokenPurpose = 'email_verify' | 'password_reset';

/**
 * One small table for both email-verification and password-reset links —
 * same shape, `purpose` discriminator, same "hash the token, never store the
 * raw secret" discipline as `auth_sessions.token_hash` / the package's
 * refresh-token hashing. `tenantId` is set only for `email_verify` tokens
 * (created at signup, when the tenant is already known) so verifying can
 * auto-mint a session with no separate tenant lookup.
 */
export const authTokens = identitySchema.table('auth_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  tokenHash: text('token_hash').notNull().unique(),
  purpose: text('purpose').$type<AuthTokenPurpose>().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
