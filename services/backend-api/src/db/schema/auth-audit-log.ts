import { uuid, text, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { identitySchema } from './tenants';
import { users } from './users';

/**
 * Minimal, auth-events-only start on docs Section 11's "undo + audit log"
 * gap — NOT the general business audit log, which stays open. Backs the
 * package's mandatory `IAuditService` port; `record()` must never throw
 * back to the caller (see `AuthAuditService`), so a bad row here can never
 * break a real login/logout/reset.
 */
export const authAuditLog = identitySchema.table('auth_audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Plain text, not a FK — @qnsc-vn/identity's IAuditService port passes
  // generic workspaceId/resourceType/resourceId strings (verified against
  // its own compiled AuthService: 'session' | 'user' + a session/family/user
  // id), not necessarily an id that always resolves to a real row here.
  workspaceId: text('workspace_id'),
  resourceType: text('resource_type'),
  resourceId: text('resource_id'),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  actorEmail: text('actor_email'),
  action: text('action').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
