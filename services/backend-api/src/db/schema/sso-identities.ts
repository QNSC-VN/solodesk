import { uuid, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { identitySchema } from './tenants';
import { users } from './users';

/**
 * Generic provider+providerSub link, not Google-specific — matches
 * `@qnsc-vn/identity`'s `SsoIdentity` domain type and
 * `IUserRepository.findSsoIdentity`/`upsertBySsoIdentity` exactly, so the
 * package's own port methods work against this table unchanged.
 */
export const ssoIdentities = identitySchema.table(
  'sso_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    provider: text('provider').notNull(),
    providerSub: text('provider_sub').notNull(),
    providerEmail: text('provider_email').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    providerSub: unique().on(t.provider, t.providerSub),
  }),
);
