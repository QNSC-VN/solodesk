import { uuid, text, timestamp, boolean, unique } from 'drizzle-orm/pg-core';
import { identitySchema, tenants } from './tenants';

export type TenantMemberRole = 'owner' | 'successor' | 'accountant_delegate';

export const tenantMembers = identitySchema.table(
  'tenant_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    userId: uuid('user_id').notNull(),
    displayName: text('display_name').notNull(),
    role: text('role').$type<TenantMemberRole>().notNull(),
    canEdit: boolean('can_edit').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantUser: unique().on(t.tenantId, t.userId),
  }),
);
