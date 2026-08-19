import { uuid, timestamp, unique } from 'drizzle-orm/pg-core';
import { identitySchema } from './tenants';
import { users } from './users';
import { tenants } from './tenants';

/**
 * Deliberately denormalized, NO RLS — same pattern as
 * `traceability.lot_traces`: `tenant_members` is correctly RLS-scoped
 * (`tenant_id = current_setting('app.tenant_id', true)`), which means it
 * structurally CANNOT be queried by `user_id` alone before any tenant
 * context exists. But real login needs exactly that: "which tenant does
 * this user belong to" at login time, before a tenant context can be
 * established. This index table is maintained alongside
 * `tenant_members` (written in the same transaction as
 * `TenantMemberDrizzleRepository.add`) purely so `findTenantIdsForUser`
 * can answer that one question safely, with no RLS bypass anywhere.
 */
export const userTenantMemberships = identitySchema.table(
  'user_tenant_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userTenant: unique().on(t.userId, t.tenantId),
  }),
);
