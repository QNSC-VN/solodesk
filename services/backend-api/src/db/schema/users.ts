import { uuid, text, boolean, integer, timestamp } from 'drizzle-orm/pg-core';
import { identitySchema } from './tenants';

export type UserStatus = 'invited' | 'active' | 'inactive' | 'suspended';

/**
 * No RLS — same "global identity data, not tenant-scoped" shape as `tenants`
 * itself, not `tenant_members`. A user can belong to more than one tenant
 * (an `accountant_delegate` helping several household businesses), so this
 * table can never be keyed by a single tenant_id. Mirrors
 * `@qnsc-vn/identity`'s `User` domain type field-for-field — this is the
 * concrete table bound to that package's `IUserRepository` port.
 */
export const users = identitySchema.table('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  // Null for a Google-only account that never set a password.
  passwordHash: text('password_hash'),
  displayName: text('display_name').notNull(),
  avatarUrl: text('avatar_url'),
  status: text('status').$type<UserStatus>().notNull().default('active'),
  emailVerified: boolean('email_verified').notNull().default(false),
  locale: text('locale').notNull().default('vi-VN'),
  timezone: text('timezone').notNull().default('Asia/Ho_Chi_Minh'),
  phone: text('phone'),
  sessionVersion: integer('session_version').notNull().default(0),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
