import { uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { identitySchema } from './tenants';
import { users } from './users';

/**
 * No RLS — sessions are looked up by `tokenHash`/`userId`, never filtered by
 * tenant. `contextId` (nullable) is the tenant a session is scoped to;
 * opaque to `@qnsc-vn/identity`'s `AuthService`, interpreted only by this
 * product. Backs `IAuthSessionRepository`.
 */
export const authSessions = identitySchema.table('auth_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  contextId: uuid('context_id'),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  tokenHash: text('token_hash').notNull().unique(),
  familyId: uuid('family_id').notNull(),
  isRevoked: boolean('is_revoked').notNull().default(false),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  // 'google' for an SSO-originated session; null for a password session.
  ssoProvider: text('sso_provider'),
  csrfToken: text('csrf_token'),
});
